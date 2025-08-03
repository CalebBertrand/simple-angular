import {
    ViewNodeTypes,
    type ComponentViewNode,
    type ViewNode,
    type ViewNodeAttribute,
} from "./template-parser";

const i = {
    createElement: (index: number, tag: string) => `createElement(${index}, '${tag}');`,
    createAttribute: ({name, value, isBound}: ViewNodeAttribute) => `createAttribute('${name}', '${value}', ${isBound});`,
    createIf: (index: number, bindExpression: string) => `createIf(${index}, '${bindExpression}');`,
    createText: (index: number, text: string, isBound: boolean) => `createText(${index}, '${text}', ${isBound});`,
    closeElement: (tag: string) => `closeElement('${tag}');`,
    closeIf: () => `closeIf();`,
};

const nodeStartInstructions = (index: number, node: ViewNode) => {
    const createInstructions: Array<string> = [];
    const updateInstructions: Array<string> = [];

    switch (node.type) {
        case ViewNodeTypes.Element:
            createInstructions.push(i.createElement(index, node.tagName));
            createInstructions.push(...node.attributes.map(i.createAttribute));
            break;
        case ViewNodeTypes.Component:
            break;
        case ViewNodeTypes.If:
            createInstructions.push(i.createIf(index, node.expression));
            break;
        case ViewNodeTypes.For:
            break; // not supported yet
        case ViewNodeTypes.Text:
            createInstructions.push(i.createText(index, node.body, node.isBound));
            break;
    }

    return [createInstructions, updateInstructions] as const;
};
const nodeEndInstructions = (node: ViewNode) => {
    const createInstructions: Array<string> = [];
    const updateInstructions: Array<string> = [];

    switch (node.type) {
        case ViewNodeTypes.If:
            createInstructions.push(i.closeIf());
            updateInstructions.push(i.closeIf());
            break;
        case ViewNodeTypes.Element:
            createInstructions.push(i.closeElement(node.tagName));
            updateInstructions.push(i.closeElement(node.tagName));
            break;
    }

    return [createInstructions, updateInstructions] as const;
};

export const createRenderFunction = (componentNode: ComponentViewNode) => {
    const createInstructions: Array<string> = [];
    const updateInstructions: Array<string> = [];
    let index = 0; // used to track where in the lView these nodes will be

    const stack = [{ node: componentNode as ViewNode, childrenProcessed: false as boolean, }];
    while (stack.length > 0) {
        const { node, childrenProcessed } = stack.at(-1)!;
        if (childrenProcessed) {
            const [nextCreate, nextUpdate] = nodeEndInstructions(node);
            createInstructions.push(...nextCreate);
            updateInstructions.push(...nextUpdate);
            stack.pop();
        } else {
            const [nextCreate, nextUpdate] = nodeStartInstructions(index++, node);
            createInstructions.push(...nextCreate);
            updateInstructions.push(...nextUpdate);

            stack.at(-1)!.childrenProcessed = true;
            if (Array.isArray(node.body)) {
                stack.push(...node.body
                           .reverse()
                           .map(n => ({ node: n, childrenProcessed: false }))
                );
            }
        }
    }

    const createStageParam = 'createStage'; // will be a boolean at runtime
    const fnBody = `
        if (${createStageParam}) {
            ${createInstructions.join('\n')}
        } else {
            ${updateInstructions.join('\n')}
        }
    `;

    return new Function(createStageParam, fnBody);
};
