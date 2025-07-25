import { componentBySelector } from "./component-registration";
import { ViewNodeTypes, type ComponentViewNode, type ViewNode } from "./template-parser";

enum ViewEntryType {
    Element,
    If,
    Attribute,
    Text,
    SubComponent
}
type ViewEntry = {
    expr: string;
    lastValue: unknown;
} & (
    {
        type: ViewEntryType.Element;
        get domElement(): HTMLElement;
    } | {
        type: ViewEntryType.If;
        elseOffset: number;
    } | {
        type: ViewEntryType.Attribute;
        get parentElement(): HTMLElement; // the index of the dom element this is on
    } | {
        type: ViewEntryType.Text;
        get textNode(): HTMLElement; // a reference to the dom text node this is on
    } | {
        type: ViewEntryType.SubComponent;
        get renderFn(): Function;
    }
);

export const createRenderFunction = (node: ComponentViewNode) => {
    const componentClass = componentBySelector.get(node.tagName);
    if (!componentClass) {
        throw new Error('ComponentViewNode should always have a valid associated component class');
    }

    const tView: Array<ViewEntry> = [];
    const stack: Array<{
        childIndex: number; // point where we have processed so far
        node: ViewNode;
    }> = [{ node, childIndex: 0 }];
    while (stack.length > 0) {
        const { node, childIndex } = stack.at(-1)!;
        if (childIndex >= node.body.length) {
            stack.pop();
            // any other cleanup
            continue;
        }

        switch (node.type) {
            case ViewNodeTypes.Element:

            case ViewNodeTypes.Component:
            case ViewNodeTypes.If:
            case ViewNodeTypes.For:
            case ViewNodeTypes.Text:
        }
    }
};
