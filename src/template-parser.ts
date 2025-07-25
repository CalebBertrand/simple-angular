import {
    componentBySelector,
    componentMetaByClass,
    type ComponentClass,
} from "./component-registration";

export type ViewNodeAttribute = {
    name: string;
    value: any;
    isBound: boolean; // if it is bound, the value will be evaluated as js with `this` set to the component class
};

export enum ViewNodeTypes {
    Element,
    Component,
    If,
    For,
    Text,
}

export type ElementViewNode = {
    type: ViewNodeTypes.Element;
    attributes: Array<ViewNodeAttribute>;
    tagName: string;
    body: Array<ViewNode>; // the element could also have plain text inside it
    isSelfClosing: boolean;
};

export type ComponentViewNode = Omit<ElementViewNode, "type"> & {
    type: ViewNodeTypes.Component;
};

export type ControlFlowViewNode =
    | {
          type: ViewNodeTypes.If;
          body: Array<ViewNode>;
          else?: Array<ViewNode>;
      }
    | {
          type: ViewNodeTypes.For; // probably wont implement until later but just for completeness
          track: string;
          body: Array<ViewNode>;
      };
export type TextViewNode = {
    type: ViewNodeTypes.Text;
    body: string;
    isBound: boolean;
};

export type ViewNode =
    | ElementViewNode
    | ControlFlowViewNode
    | TextViewNode
    | ComponentViewNode;

// intended to run on whatever's between the opening and closing angle brackets
function isValidOpenOrSelfClosingTag(
    str: string,
): false | ElementViewNode | ComponentViewNode {
    str = str.trim();

    const isSelfClosing = str.endsWith("/");
    const inner = str.slice(1, isSelfClosing ? -2 : -1).trim();

    if (!inner) return false;

    const parts = inner.split(/\s+/);

    const tagName = parts[0];
    if (!isValidTagName(tagName)) return false;

    // Validate each attribute
    const attributes: Array<ViewNodeAttribute> = [];
    for (let i = 1; i < parts.length; i++) {
        const attr = parts[i];
        const attrValidation = isValidAttribute(attr);
        if (!attrValidation) return false;
        attributes.push(attrValidation);
    }

    return {
        type: componentBySelector.has(tagName)
            ? ViewNodeTypes.Component
            : ViewNodeTypes.Element,
        tagName,
        isSelfClosing,
        attributes,
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
    const value = attr.slice(eqIndex + 1).trim();

    let isBound = false;
    if (name.startsWith("[") && name.endsWith("]")) {
        isBound = true;
        name = name.slice(1, -1);
    }

    if (!isValidTagName(name)) return false;
    if (!(value.startsWith('"') && value.endsWith('"'))) return false;

    return { name, value, isBound };
}

function isValidClosingTag(str: string) {
    const parts = str.split(/\s+/);
    if (parts.length !== 1) return false;
    const [tagName] = parts;
    if (!isAlphaNum(tagName)) return false;
    return { tagName };
}

function isAlpha(ch: string) {
    return /^[A-Za-z]$/.test(ch);
}

function isAlphaNum(ch: string) {
    return /^[A-Za-z0-9]$/.test(ch);
}

export const parseComponent = (component: ComponentClass) => {
    const meta = componentMetaByClass.get(component);
    if (!meta) {
        throw new Error("This class was not registered as a component.");
    }
    const template = meta.template;

    let index = 0;
    let lastIdentifiedText = 0;
    let rootElement: ElementViewNode | undefined = undefined;
    const tagStack: Array<ElementViewNode | ControlFlowViewNode> = [];

    const addToParent = (node: ViewNode) => {
        const parent = tagStack.at(-1);
        if (!parent) {
            if (node.type === ViewNodeTypes.Element) {
                tagStack.push(node);
                rootElement = node;
                return;
            } else {
                throw new Error(
                    "Templates must always have a root element which contains everything else.",
                );
            }
        }

        if (parent.type === ViewNodeTypes.If && parent.else != null) {
            parent.else.push(node);
        } else {
            parent.body.push(node);
        }
    };

    // used to add all the unidentified characters since the last identified element to the current parent
    // element as plain text. This happens pretty much anytime something new is identified
    const addPastTextToParent = () => {
        const textSegment = template
            .slice(lastIdentifiedText + 1, index)
            .trim();
        if (textSegment) {
            addToParent({
                type: ViewNodeTypes.Text,
                body: textSegment,
                isBound: false,
            });
        }
    };

    while (index < template.length) {
        const nextChar = template.charAt(index);

        if (nextChar.match("\s")) {
            index++;
            continue;
        } else if (nextChar === "<") {
            const closingBracket = template.indexOf(">", index);
            if (closingBracket < 0) {
                index++;
                continue;
            }

            const openingValidation = isValidOpenOrSelfClosingTag(
                template.slice(index + 1, closingBracket),
            );

            // valid opening tag, skip to end and update stack as needed
            if (openingValidation) {
                addPastTextToParent();

                const { isSelfClosing, tagName, attributes } =
                    openingValidation;
                if (!isSelfClosing) {
                    tagStack.push({
                        type: ViewNodeTypes.Element,
                        attributes,
                        tagName,
                        isSelfClosing,
                        body: [],
                    });
                }

                lastIdentifiedText = index;
                index = closingBracket + 1;
                continue;
            } else {
                const closingValidation = isValidClosingTag(
                    template.slice(index + 1, closingBracket),
                );
                if (!closingValidation) {
                    index++;
                    continue;
                }

                addPastTextToParent();

                const tagToClose = tagStack.pop();
                if (
                    tagToClose?.type !== ViewNodeTypes.Element ||
                    tagToClose.tagName !== closingValidation.tagName
                ) {
                    throw new Error(
                        `Unexpected closing ${closingValidation.tagName} element.`,
                    );
                }

                addToParent(tagToClose);

                lastIdentifiedText = index;
                index = closingBracket + 1;
                continue;
            }
        } else if (nextChar === "@") {
            if (template.slice(index, index + 3) === "@if") {
                const openingBracket = template.indexOf("{", index + 3);
                if (openingBracket > 0) {
                    index = openingBracket + 1;
                    tagStack.push({
                        type: ViewNodeTypes.If,
                        body: [],
                    });
                    continue;
                } else {
                    // There was no opening bracket, so we will interpret the @if as plain text and move on
                    index = index + 3;
                    continue;
                }
            }
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
                addToParent(parent);
                lastIdentifiedText = index;
                index++;
                continue;
            }
        } else if (nextChar === "{") {
            if (template[index + 1] === "{") {
                const closingBrackets = template.indexOf("}}", index);
                if (closingBrackets > 0) {
                    addToParent({
                        type: ViewNodeTypes.Text,
                        body: template.slice(index + 2, closingBrackets).trim(),
                        isBound: true,
                    });
                    index = closingBrackets + 2;
                    continue;
                }

                index = index + 2;
                continue;
            }

            index++;
            continue;
        }
    }

    console.assert(tagStack.length === 0);
    console.assert(!!rootElement);

    return rootElement;
};
