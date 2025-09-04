import { getComponentMeta } from "./component-registration";
import { assert } from "./utils/assert";
import type { Class } from "./utils/Class";

export type ViewNodeAttribute = {
    name: string;
    value: any;
    isBound: boolean; // if it is bound, the value will be evaluated as js with `this` set to the component class
};
export type ViewNodeEvent = {
    name: string;
    value: string;
};

export enum ViewNodeTypes {
    Element,
    Component,
    If,
    For,
    Text,
}

export interface ViewNodeStructure {
    type: ViewNodeTypes;
}

export interface ElementViewNode extends ViewNodeStructure {
    type: ViewNodeTypes.Element;
    attributes: Array<ViewNodeAttribute>;
    events: Array<ViewNodeEvent>;
    tagName: string;
    body: Array<ViewNode>; // the element could also have plain text inside it
    isSelfClosing: boolean;
}
export interface ComponentViewNode extends Omit<ElementViewNode, "type"> {
    type: ViewNodeTypes.Component;
}

export interface IfViewNode extends ViewNodeStructure {
    type: ViewNodeTypes.If;
    expression: string;
    body: Array<ViewNode>;
    else?: Array<ViewNode>;
}
export interface ForViewNode extends ViewNodeStructure {
    type: ViewNodeTypes.For; // probably wont implement until later but just for completeness
    track: string;
    body: Array<ViewNode>;
}
export type ControlFlowViewNode = IfViewNode | ForViewNode;

export interface TextViewNode extends ViewNodeStructure {
    type: ViewNodeTypes.Text;
    body: string;
    isBound: boolean;
}

export type ViewNode =
    | ElementViewNode
    | ComponentViewNode
    | IfViewNode
    | ForViewNode
    | TextViewNode;

type LexingResult<T> =
    | {
        valid: false;
        jumpTo: number;
    }
    | ({
        valid: true;
        jumpTo: number;
    } & T);

function areValidElementParts(
    template: string,
    startIndex: number,
    endIndex: number,
): false | Array<string> {
    if (!isAlpha(template.charAt(startIndex))) return false;

    const parts = [];
    let i = startIndex + 1;
    let currentPartStart = i;

    enum ParseState {
        InTag,
        InAttrName,
        InQuotes,
        InWhitespace,
    }
    let state: ParseState = ParseState.InTag;
    while (i < endIndex + 1) {
        const char = template.charAt(i);
        switch (state) {
            case ParseState.InTag:
                if (/[/>\s]/g.test(char)) {
                    state = ParseState.InWhitespace;
                    parts.push(template.slice(startIndex, i));
                } else if (!isAlphaNum(char)) {
                    return false; // invalid tag name
                }

                i++;
                continue;
            case ParseState.InQuotes:
                if (char === '"') {
                    parts.push(template.slice(currentPartStart, i + 1));
                    state = ParseState.InWhitespace;
                }

                i++;
                continue;
            case ParseState.InWhitespace:
                if (!/[/>\s]/g.test(char)) {
                    currentPartStart = i;
                    state = ParseState.InAttrName;
                }

                i++;
                continue;
            case ParseState.InAttrName:
                if (/[/>\s]/g.test(char)) {
                    // must be a shorthand attribute, like "invalid"
                    parts.push(template.slice(currentPartStart, i + 1));
                    state = ParseState.InWhitespace;
                } else if (char === "=" && template.charAt(i + 1) === '"') {
                    i++;
                    state = ParseState.InQuotes;
                }

                i++;
                continue;
        }
    }

    if (state !== ParseState.InWhitespace) {
        return false;
    }

    return parts;
}

// intended to run on whatever's between the opening and closing angle brackets
function isValidOpenOrSelfClosingTag(
    template: string,
    startIndex: number,
    endIndex: number,
): false | ElementViewNode | ComponentViewNode {
    const isSelfClosing = template[endIndex - 1] === "/";

    const parts = areValidElementParts(template, startIndex, endIndex);
    if (parts === false) return false;

    const tagName = parts[0];

    // Validate each attribute
    const attributes: Array<ViewNodeAttribute> = [];
    const events: Array<ViewNodeEvent> = [];
    for (let i = 1; i < parts.length; i++) {
        const attr = parts[i];
        const attrValidation = isValidAttribute(attr);
        if (attrValidation) {
            attributes.push(attrValidation);
            continue;
        }

        const eventValidation = isValidEvent(attr + '"');
        if (eventValidation) {
            events.push(eventValidation);
            continue;
        }

        return false; // not a valid opening tag, that wasn't a valid attribute or event
    }

    let type: ViewNodeTypes.Element | ViewNodeTypes.Component;
    try {
        getComponentMeta(tagName);
        type = ViewNodeTypes.Component;
    } catch {
        type = ViewNodeTypes.Element;
    }

    return {
        type,
        tagName,
        isSelfClosing,
        attributes,
        events,
        body: [],
    };
}

function isValidTagName(name: string): boolean {
    if (!name) return false;
    const firstChar = name[0];
    if (!isAlpha(firstChar)) return false;
    return [...name].every((ch) => isAlphaNum(ch) || ch === "-" || ch === ":");
}

function isValidAttribute(attr: string): false | ViewNodeAttribute {
    // Allow: attr or attr="value"
    const eqIndex = attr.indexOf("=");
    if (eqIndex === -1) {
        return isValidTagName(attr)
            ? { name: attr, value: true, isBound: false }
            : false;
    }

    let name = attr.slice(0, eqIndex).trim();
    const quotes = attr.slice(eqIndex + 1).trim();
    if (!(quotes.startsWith('"') && quotes.endsWith('"'))) return false;
    const value = quotes.slice(1, -1);

    let isBound = false;
    if (name.startsWith("[") && name.endsWith("]")) {
        isBound = true;
        name = name.slice(1, -1);
    }

    if (!isValidTagName(name)) return false;

    return { name, value, isBound };
}

function isValidEvent(attr: string): false | ViewNodeEvent {
    const eqIndex = attr.indexOf("=");
    if (eqIndex === -1) return false;

    let name = attr.slice(0, eqIndex).trim();
    const value = attr.slice(eqIndex + 1).trim();

    if (!name.startsWith("(") || !name.endsWith(")")) return false;
    name = name.slice(1, -1);

    if (!isValidTagName(name)) return false;
    if (!(value.startsWith('"') && value.endsWith('"'))) return false;

    return { name, value: value.slice(1, -2) };
}

function isValidClosingTag(
    template: string,
    startIndex: number,
    endIndex: number,
): LexingResult<{ tagName: string }> {
    const failedResult: LexingResult<{ tagName: string }> = {
        valid: false,
        jumpTo: startIndex,
    };

    if (template[startIndex] !== "/") return failedResult;
    const parts = template.slice(startIndex + 1, endIndex).split(/\s+/);
    if (parts.length !== 1) return failedResult;
    const [tagName] = parts;
    if (!isValidTagName(tagName)) return failedResult;

    return { valid: true, jumpTo: endIndex + 1, tagName };
}

function isValidIfOpening(
    template: string,
    index: number,
): LexingResult<{ innerExpression: string }> {
    const validationState = {
        valid: false,
        jumpTo: index,
    } as LexingResult<any> & { valid: false };
    if (template.slice(index, index + 3) === "@if") {
        validationState.jumpTo += 3;

        const openingBracket = template.indexOf("{", index + 3);
        if (openingBracket < 0) {
            return validationState;
        }

        const ifStart = index + 3;
        const openingParens = template.indexOf("(", ifStart);
        if (openingParens < ifStart || openingParens > openingBracket) {
            return validationState;
        }

        let i = openingParens;
        let parens = 1;
        do {
            i++;

            if (template[i] === ")") {
                parens--;
            } else if (template[i] === "(") {
                parens++;
            }
        } while (parens > 0 && i < openingBracket);

        if (i >= openingBracket) {
            return validationState;
        }

        const closingParens = i;
        if (template.slice(closingParens + 1, openingBracket).trim().length) {
            return validationState; // there was something other than whitespace between the ) and {
        }

        const innerExpression = template.slice(
            openingParens + 1,
            closingParens,
        );
        validationState.jumpTo = openingBracket + 1;
        return {
            ...validationState,
            valid: true,
            innerExpression,
        };
    }

    return validationState;
}

function isAlpha(ch: string) {
    return /^[A-Za-z]$/.test(ch);
}

function isAlphaNum(ch: string) {
    return /^[A-Za-z0-9\-]$/.test(ch);
}

export const parseComponent = (component: Class) => {
    const meta = getComponentMeta(component);
    if (!meta) {
        throw new Error("This class was not registered as a component.");
    }
    const template = meta.template;

    let index = 0;
    let lastIdentifiedText = 0;
    let rootElements: Array<ViewNode> = [];
    const tagStack: Array<
        ElementViewNode | ControlFlowViewNode | ComponentViewNode
    > = [];

    /**
     * Adds the node to the parent node (or the root elements if there is no parent)
     * @param node - the node to add
     */
    const addNode = (node: ViewNode) => {
        const parent = tagStack.at(-1);

        if (!parent) {
            rootElements.push(node);
        } else {
            if (parent.type === ViewNodeTypes.If && parent.else != null) {
                parent.else.push(node);
            } else {
                parent.body.push(node);
            }
        }

        // update the parent for elements that have children
        const blockTypes = [
            ViewNodeTypes.Element,
            ViewNodeTypes.Component,
            ViewNodeTypes.If,
        ];
        if (blockTypes.includes(node.type)) {
            if ("isSelfClosing" in node && node.isSelfClosing) return;
            tagStack.push(node as any);
        }
    };

    // used to add all the unidentified characters since the last identified element to the current parent
    // element as plain text. This happens pretty much anytime something new is identified
    const addPastTextToParent = () => {
        const textSegment = template
            .slice(lastIdentifiedText + 1, index)
            .trim();
        if (textSegment) {
            addNode({
                type: ViewNodeTypes.Text,
                body: textSegment,
                isBound: false,
            });
        }
    };

    while (index < template.length) {
        const nextChar = template.charAt(index);

        if (nextChar.match(/\s/)) {
            index++;
            continue;
        } else if (nextChar === "<") {
            const closingBracket = template.indexOf(">", index);
            if (closingBracket < 0) {
                index++;
                continue;
            }

            const openingValidation = isValidOpenOrSelfClosingTag(
                template,
                index + 1,
                closingBracket,
            );

            // valid opening tag, skip to end and update stack as needed
            if (openingValidation) {
                addPastTextToParent();
                addNode(openingValidation);

                index = closingBracket + 1;
                lastIdentifiedText = index - 1;
                continue;
            } else {
                const closingValidation = isValidClosingTag(
                    template,
                    index + 1,
                    closingBracket,
                );

                if (!closingValidation.valid) {
                    index = closingValidation.jumpTo;
                    continue;
                }

                addPastTextToParent();

                index = closingValidation.jumpTo;
                lastIdentifiedText = index - 1;

                const tagToClose = tagStack.pop();
                assert(
                    !!tagToClose,
                    "Tried to close a tag but the tag stack was empty",
                );

                continue;
            }
        } else if (nextChar === "@") {
            const validation = isValidIfOpening(template, index);
            if (validation.valid) {
                addPastTextToParent();
                addNode({
                    type: ViewNodeTypes.If,
                    expression: validation.innerExpression,
                    body: [],
                });
            }

            index = validation.jumpTo;
            lastIdentifiedText = index - 1;
        } else if (nextChar === "}") {
            const parent = tagStack.at(-1);
            if (parent?.type === ViewNodeTypes.If) {
                addPastTextToParent();

                // Check if there's an @else following this closing bracket
                let nextIndex = index + 1;
                while (
                    nextIndex < template.length &&
                    template[nextIndex].match(/\s/)
                ) {
                    nextIndex++;
                }

                if (template.slice(nextIndex, nextIndex + 5) === "@else") {
                    const elseOpeningBracket = template.indexOf(
                        "{",
                        nextIndex + 5,
                    );
                    if (elseOpeningBracket > 0) {
                        parent.else = [];

                        lastIdentifiedText = elseOpeningBracket + 1;
                        index = elseOpeningBracket + 1;
                        continue;
                    }
                }

                // No @else found, pop the if statement and add it to parent
                tagStack.pop();
                lastIdentifiedText = index;
                index++;
                continue;
            }
        } else if (nextChar === "{") {
            if (template[index + 1] === "{") {
                const closingBrackets = template.indexOf("}}", index);
                if (closingBrackets > 0) {
                    addPastTextToParent();
                    addNode({
                        type: ViewNodeTypes.Text,
                        body: template.slice(index + 2, closingBrackets).trim(),
                        isBound: true,
                    });
                    index = closingBrackets + 2;
                    lastIdentifiedText = index - 1;
                    continue;
                }

                index = index + 2;
                continue;
            }

            index++;
            continue;
        } else {
            // assume it's just text
            index++;
        }
    }

    return {
        type: ViewNodeTypes.Component,
        tagName: meta.selector,
        isSelfClosing: false,
        attributes: [],
        events: [],
        body: rootElements,
    } satisfies ComponentViewNode;
};
