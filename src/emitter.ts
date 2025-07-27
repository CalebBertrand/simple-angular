import {
    ViewNodeTypes,
    type ComponentViewNode,
    type ViewNode,
    type ViewNodeAttribute,
} from "./template-parser";

const i = {
    createElement: (tag: string) => `createElement('${tag}');`,
    createAttribute: ({name, value, isBound}: ViewNodeAttribute) => `createAttribute('${name}', '${value}', ${isBound});`,
    createIf: (bindExpression: string) => `createIf('${bindExpression}');`,
};

const nodeStartInstructions = (node: ViewNode) => {
    const instructions: Array<string> = [];
    switch (node.type) {
        case ViewNodeTypes.Element:
            instructions.push(i.createElement(node.tagName));
            instructions.push(node.attributes.map(i.createAttribute));
            break;
        case ViewNodeTypes.Component:
            break;
        case ViewNodeTypes.If:
            instructions.push(i.createIf(node.));
        case ViewNodeTypes.For:
        case ViewNodeTypes.Text:
    }

    return instructions.join('\n');
};
const endInstructions = (node: ViewNode) => {

};

export const createRenderFunction = (node: ComponentViewNode) => {
    let fnBody = "";

    const stack: Array<{
        childIndex: number; // point where we have processed so far
        node: ViewNode;
    }> = [{ node, childIndex: 0 }];
    while (stack.length > 0) {
        const { node, childIndex } = stack.at(-1)!;
        if (childIndex >= node.body.length) {
            stack.pop();
            continue;
        }

        // on first added to the stack, process the node itself
        if (childIndex === 0) {
            
        }

    }
};
