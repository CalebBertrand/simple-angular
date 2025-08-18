import {
    ViewNodeTypes,
    type ComponentViewNode,
    type ViewNode,
    type ViewNodeAttribute,
    type ViewNodeEvent,
} from "./template-parser";
import type { MapUnion } from "./utils/UnionMapper";

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
            body: Array<InstructionNode>;
        };
        [ViewNodeTypes.Element]: {
            type: InstructionNodeType.Element;
            body: Array<InstructionNode>;
        };
        [ViewNodeTypes.Component]: {
            type: InstructionNodeType.Component;
            body: Array<InstructionNode>;
        };
        [ViewNodeTypes.Text]: {
            type: InstructionNodeType.Text;
        },
        [ViewNodeTypes.For]: {
            type: InstructionNodeType.For;
        },
    }
>;
type InstructionNode = InstructionNodeBase | { type: InstructionNodeType.Else; body: Array<InstructionNode>; };

type ComponentInstructionNode = InstructionNode & {
    type: InstructionNodeType.Component;
};

type InstructionStack = Array<{
    node: InstructionNode;
    childrenProcessed: boolean;
}>;

/** The instructions to be emitted in the render funcion (indexes refer to a point in the runtime lView) */

const i = {
    createComponent: (index: number, tagName: string) =>
        `createComponent(${index}, '${tagName}');`,
    enterComponent: (index: number) => `enterComponent(${index});`,
    createElement: (index: number, tag: string) =>
        `createElement(${index}, '${tag}');`,
    enterElement: (index: number) => `enterElement(${index})`,
    createAttribute: ({ name, value, isBound }: ViewNodeAttribute) =>
        `createAttribute('${name}', '${value}', ${isBound});`,
    updateAttribute: ({ name }: ViewNodeAttribute) =>
        `updateAttribute('${name}')`,
    createIf: (index: number, bindExpression: string) =>
        `createIf(${index}, '${bindExpression}');`,
    createElse: (index: number) => `createElse(${index})`,
    enterConditional: (index: number) => `enterConditional(${index});`,
    createText: (index: number, text: string, isBound: boolean) =>
        `createText(${index}, '${text}', ${isBound});`,
    updateText: (index: number) => `updateText(${index});`,
    closeElement: (tag: string) => `closeElement('${tag}');`,
    closeConditional: () => `closeConditional();`,
    closeComponent: () => `closeComponent();`,
    createEvent: ({ name, value }: ViewNodeEvent) => `createEvent('${name}', '${value}')`,
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
            const {
                updateInstructions: innerUpdateInstructs,
                createInstructions: innerCreateInstructs,
            } = createRenderFnRec(node);

            createInstructions.push(
                i.createComponent(index, node.tagName),
                ...innerCreateInstructs,
            );

            updateInstructions.push(
                i.enterComponent(index),
                ...innerUpdateInstructs,
            );
            break;
        case InstructionNodeType.If:
            createInstructions.push(i.createIf(index, node.expression));

            updateInstructions.push(i.enterConditional(index));
            break;
        case InstructionNodeType.Else:
            createInstructions.push(i.createElse(index));

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
        case InstructionNodeType.If:
        case InstructionNodeType.Else:
            createInstructions.push(i.closeConditional());
            break;
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

const createRenderFnRec = (componentNode: ComponentInstructionNode) => {
    const createInstructions: Array<string> = [];
    const updateInstructions: Array<string> = [];
    let index = 0; // used to track where in the lView these nodes will be

    const stack: InstructionStack = componentNode.body.map(node => (
        {
            node,
            childrenProcessed: false,
        }
    ));
    while (stack.length > 0) {
        const { node, childrenProcessed } = stack.at(-1)!;
        if (childrenProcessed) {
            const [nextCreate, nextUpdate] = nodeEndInstructions(node);
            createInstructions.push(...nextCreate);
            updateInstructions.push(...nextUpdate);
            stack.pop();

            if (node.type === InstructionNodeType.If && node.else) {
                stack.push({
                    node: {
                        type: InstructionNodeType.Else,
                        body: node.body,
                    },
                    childrenProcessed: false,
                });
            }
        } else {
            const [nextCreate, nextUpdate] = nodeStartInstructions(
                index++,
                node,
            );
            createInstructions.push(...nextCreate);
            updateInstructions.push(...nextUpdate);

            stack.at(-1)!.childrenProcessed = true;
            if (Array.isArray(node.body)) {
                stack.push(
                    ...node.body.reverse().map((n: any) => ({
                        node: n as InstructionNode,
                        childrenProcessed: false,
                    })),
                );
            }
        }
    }

    const createStageParam = "createStage"; // will be a boolean at runtime
    const fnBody = `
        if (${createStageParam}) {
            ${createInstructions.join("\n")}
        } else {
            ${updateInstructions.join("\n")}
        }
    `;

    const renderFn = new Function(createStageParam, fnBody);
    return {
        renderFn,
        createInstructions,
        updateInstructions,
    };
};

export const createRenderFn = (node: ComponentViewNode) => {
    return createRenderFnRec(node as any).renderFn;
};
