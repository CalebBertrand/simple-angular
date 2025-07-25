import {
    ViewNodeTypes,
    type ComponentViewNode,
    type ViewNode,
} from "./template-parser";

const i = {
    CreateElement: (tag: string) => "createElement()",
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

        switch (node.type) {
            case ViewNodeTypes.Element:
                fnBody += "";

            case ViewNodeTypes.Component:
            case ViewNodeTypes.If:
            case ViewNodeTypes.For:
            case ViewNodeTypes.Text:
        }
    }
};
