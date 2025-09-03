import {
    ViewNodeTypes,
    type ComponentViewNode,
    type ViewNode,
    type ViewNodeAttribute,
    type ViewNodeEvent,
} from "./template-parser";
import type { MapUnion } from "./utils/UnionMapper";
import { instructions } from "./instructions";
import { assert } from "./utils/assert";

/** Some Domain Mapping */

// this is an internal data structure which is used to keep track of where in the dom tree we are
// currently emitting. It needs a specific node type for else because in the ViewNode AST if and else
// are part of a single node, but the instructions implement them as two separate blocks
enum InstructionNodeType {
    Text = ViewNodeTypes.Text,
    Element = ViewNodeTypes.Element,
    Component = ViewNodeTypes.Component,
    For = ViewNodeTypes.For,
    If = ViewNodeTypes.If,
    Else,
}

// just to map from the view node types
type InstructionNodeBase = MapUnion<
    ViewNode,
    "type",
    {
        [ViewNodeTypes.If]: {
            type: InstructionNodeType.If;
            renderFnId: string;
            body: Array<InstructionNode>;
        };
        [ViewNodeTypes.Element]: {
            type: InstructionNodeType.Element;
            renderFnId: string;
            body: Array<InstructionNode>;
        };
        [ViewNodeTypes.Component]: {
            type: InstructionNodeType.Component;
            renderFnId: string;
            body: Array<InstructionNode>;
        };
        [ViewNodeTypes.Text]: {
            type: InstructionNodeType.Text;
        };
        [ViewNodeTypes.For]: {
            type: InstructionNodeType.For;
            renderFnId: string;
            body: Array<InstructionNode>;
        };
    }
>;
type InstructionNode =
    | InstructionNodeBase
    | {
        type: InstructionNodeType.Else;
        body: Array<InstructionNode>;
        renderFnId: string;
    };

// The types of view nodes which can act as roots for a "template" in angular, meaning something which map
// be init or destroyed multiple times, in a single chunk
type TemplateInstructionNode = InstructionNode & { type: InstructionNodeType.Component | InstructionNodeType.For | InstructionNodeType.If | InstructionNodeType.Else }

type InstructionStack = Array<[
    node: InstructionNode,
    childrenProcessed: boolean
]>;


export const renderFnRegistry = new Map<string, (createStage: boolean) => void>;

/** The instructions to be emitted in the render funcion (indexes refer to a point in the runtime lView) */

const i = {
    createComponent: (index: number, tagName: string, renderFnId: string) =>
        `createComponent(${index}, '${tagName}', '${renderFnId}');`,
    enterComponent: (index: number) => `enterComponent(${index});`,
    createElement: (index: number, tag: string) =>
        `createElement(${index}, '${tag}');`,
    enterElement: (index: number) => `enterElement(${index})`,
    createAttribute: ({ name, value, isBound }: ViewNodeAttribute) =>
        `createAttribute('${name}', '${value}', ${isBound});`,
    updateAttribute: ({ name }: ViewNodeAttribute) =>
        `updateAttribute('${name}')`,
    createIf: (index: number, bindExpression: string, renderFnId: string) =>
        `createIf(${index}, '${bindExpression}', '${renderFnId}');`,
    createElse: (index: number, renderFnId: string) => `createElse(${index}, '${renderFnId}')`,
    enterConditional: (index: number) => `enterConditional(${index});`,
    createText: (index: number, text: string, isBound: boolean) =>
        `createText(${index}, '${text}', ${isBound});`,
    updateText: (index: number) => `updateText(${index});`,
    closeElement: (tag: string) => `closeElement('${tag}');`,
    closeComponent: () => `closeComponent();`,
    createEvent: ({ name, value }: ViewNodeEvent) =>
        `createEvent('${name}', '${value}')`,
};

const nodeStartInstructions = (index: number, node: InstructionNode) => {
    const createInstructions: Array<string> = [];
    const updateInstructions: Array<string> = [];

    switch (node.type) {
        case InstructionNodeType.Element:
            createInstructions.push(i.createElement(index, node.tagName));
            createInstructions.push(...node.attributes.map(i.createAttribute));
            createInstructions.push(...node.events.map(i.createEvent));

            updateInstructions.push(i.enterElement(index));
            updateInstructions.push(
                ...node.attributes
                    .filter((a) => a.isBound)
                    .map(i.updateAttribute),
            );
            break;
        case InstructionNodeType.Component:
            createInstructions.push(i.createComponent(index, node.tagName, createRenderFnRec(node)));
            updateInstructions.push(i.enterComponent(index));
            break;
        case InstructionNodeType.If:
            createInstructions.push(i.createIf(index, node.expression, createRenderFnRec(node)));
            updateInstructions.push(i.enterConditional(index));
            break;
        case InstructionNodeType.Else:
            createInstructions.push(i.createElse(index, createRenderFnRec(node)));
            updateInstructions.push(i.enterConditional(index));
            break;
        case InstructionNodeType.Text:
            createInstructions.push(
                i.createText(index, node.body, node.isBound),
            );

            if (node.isBound) {
                updateInstructions.push(i.updateText(index));
            }
            break;
    }

    return [createInstructions, updateInstructions] as const;
};

const nodeEndInstructions = (node: InstructionNode) => {
    const createInstructions: Array<string> = [];
    const updateInstructions: Array<string> = [];

    switch (node.type) {
        case InstructionNodeType.Element:
            createInstructions.push(i.closeElement(node.tagName));
            updateInstructions.push(i.closeElement(node.tagName));
            break;
        case InstructionNodeType.Component:
            createInstructions.push(i.closeComponent());
            updateInstructions.push(i.closeComponent());
            break;
    }

    return [createInstructions, updateInstructions] as const;
};

const createRenderFnRec = (templateNode: TemplateInstructionNode) => {
    const fnId = crypto.randomUUID();
    templateNode.renderFnId = fnId;

    const createInstructions: Array<string> = [];
    const updateInstructions: Array<string> = [];
    let index = 0; // used to track where in the lView these nodes will be. 0 is already taken by the parent component

    const stack: InstructionStack = templateNode.body.reverse().map(node => [node, false]);
    while (stack.length > 0) {
        const [node, childrenProcessed] = stack.at(-1)!;
        if (childrenProcessed) {
            const [nextCreate, nextUpdate] = nodeEndInstructions(node);
            createInstructions.push(...nextCreate);
            updateInstructions.push(...nextUpdate);
            stack.pop();

            if (node.type === InstructionNodeType.If && node.else) {
                stack.push([
                    {
                        type: InstructionNodeType.Else,
                        body: node.else,
                    },
                    false,
                ] as any);
            }
        } else {
            const [nextCreate, nextUpdate] = nodeStartInstructions(
                index++,
                node,
            );
            createInstructions.push(...nextCreate);
            updateInstructions.push(...nextUpdate);

            stack.at(-1)![1] = true;

            // if it's a simple element, we can include it's children in this render function. Other
            // block type nodes like components or control flow will be packaged into their own render functions
            if (node.type === InstructionNodeType.Element) {
                stack.push(
                    ...node.body.reverse().map(node => [node, false] as [InstructionNode, boolean]),
                );
            }
        }
    }

    const renderFn = renderFnFromInstructions(createInstructions, updateInstructions);

    renderFnRegistry.set(fnId, renderFn);
    return fnId;
};

export const createRenderFn = (node: ComponentViewNode) => {
    const fnId = createRenderFnRec(node as any);
    const renderFn = renderFnFromInstructions(
        [i.createComponent(0, node.tagName, fnId), i.closeComponent()],
        [i.enterComponent(0), i.closeComponent()],
    );

    return renderFn;
};

const renderFnFromInstructions = (createInstructions: Array<string>, updateInstructions: Array<string>) => {
    const fnBody = `
        if (createStage) {
            ${createInstructions.join("\n")}
        } else {
            ${updateInstructions.join("\n")}
        }
    `;

    const instructionParams = Object.keys(instructions);
    const instructionFunctions = Object.values(instructions);

    const wrapped = (createStageParam: boolean) => {
        const innerFn = new Function(...instructionParams, 'createStage', fnBody);
        return innerFn.call(
            null,
            ...instructionFunctions,
            createStageParam,
        );
    };

    wrapped.debug = fnBody;
    return wrapped;
};
