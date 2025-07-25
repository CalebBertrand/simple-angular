import type { ViewNodeAttribute } from "./template-parser";

type Binding = {
    staticValue: any;
} | {
    expression: string;
    lastValue: any | null;
};

enum RenderNodeType {
    Element,
    If,
    Text
}

type RenderNode = { 
    index: number | null; // it could be null if its not stored in the lView (such as completely static content)
    parent: BlockRenderNodes | null;
} & ({ 
    type: RenderNodeType.Element;
    native: HTMLElement;
    attributes: Map<string, Binding>;
} | {
    type: RenderNodeType.If;
    native: Comment;
    binding: Binding;
    elseIndex: number | null;
} | {
    type: RenderNodeType.Text;
    native: Text;
    binding: Binding;
});

type BlockRenderNodes = Extract<RenderNode, { type: RenderNodeType.If | RenderNodeType.Element; }>;
type RenderingState = { 
    parent: BlockRenderNodes | null;
    lView: Array<RenderNode>;
};
const renderingState: RenderingState = {
    parent: null,
    lView: []
};

export const enterComponent = () => {
    renderingState.lView = [];
    renderingState.parent = null;
};

export const createElement = (tag: string, attributesDef: Array<ViewNodeAttribute>) => {
    const lView = renderingState.lView;
    const native = document.createElement(tag);
    const parent = renderingState.parent;

    let anyBoundAttributes = false;
    const attributes = new Map<string, Binding>();
    for (const { isBound, name, value } of attributesDef) {
        anyBoundAttributes = anyBoundAttributes || isBound;
        attributes.set(name, isBound ? { expression: value, lastValue: null } : { staticValue: value });
    }

    const elementNode: Extract<RenderNode, { type: RenderNodeType.Element }> = {
        parent,
        index: anyBoundAttributes ? lView.length : null,
        type: RenderNodeType.Element,
        native,
        attributes
    };

    if (anyBoundAttributes) {
        lView.push(elementNode);
    }
    
    renderingState.parent = elementNode;
};

export const closeElement = (tag: string) => {
    const parent = renderingState.parent;
    if (parent?.type !== RenderNodeType.Element || parent.native.tagName !== tag) {
        throw new Error(`Unexpected closing ${tag} tag.`);
    }

    renderingState.parent = parent.parent;
};

export const createText = (text: string, isBound: boolean) => {
    const lView = renderingState.lView;
    const parent = renderingState.parent;
    if (!parent || (parent.type !== RenderNodeType.Element && parent.type !== RenderNodeType.If)) {
        throw new Error('No parent element to append text to.');
    }

    const binding: Binding = isBound ? { expression: text, lastValue: null } : { staticValue: text };

    const native = document.createTextNode(text);
    const textNode: Extract<RenderNode, { type: RenderNodeType.Text }> = {
        parent,
        native,
        index: isBound ? lView.length : null,
        type: RenderNodeType.Text,
        binding
    };

    if (isBound) {
        lView.push(textNode);
    }

    parent.native.appendChild(native);
};

export const createIf = (expression: string) => {
    const lView = renderingState.lView;
    const parent = renderingState.parent;
    if (!parent || (parent.type !== RenderNodeType.Element && parent.type !== RenderNodeType.If)) {
        throw new Error('No parent element to append text to.');
    }

    const native = document.createComment(`<__if__ bind="${expression}">`);
    const ifNode: Extract<RenderNode, { type: RenderNodeType.If }> = {
        binding: { expression, lastValue: null },
        parent, native, index: lView.length, type: RenderNodeType.If, elseIndex: null
    };

    lView.push(ifNode);
    renderingState.parent = ifNode;
};

export const closeIf = () => {
    const parent = renderingState.parent;
    if (parent?.type !== RenderNodeType.If) {
        throw new Error('Tried to close an if but we were not in an if block.');
    }

    renderingState.parent = parent.parent;
};
