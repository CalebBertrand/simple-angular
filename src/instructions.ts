import { getComponentMeta } from "./component-registration";
import { renderFnRegistry } from "./emitter";
import { assert } from "./utils/assert";

type Binding =
    | {
        static: true;
        value: string;
    }
    | {
        static: false;
        expression: Function;
        lastValue: any;
    };

enum LViewEntryType {
    Component,
    Element,
    If,
    Else,
    Text,
}

type LViewEntry = {
    index: number | null; // it could be null if its not stored in the lView (such as completely static content)
    parent: LViewBlockEntries | null;
} & (
        | {
            type: LViewEntryType.Element;
            native: HTMLElement;
            attributes: Map<string, Binding>;
            events: Map<string, string>;
        }
        | {
            type: LViewEntryType.If;
            anchor: HTMLDivElement;
            native: HTMLDivElement;
            binding: Binding & { static: false }; // technically this could be optimized to cover the case when an if statement has a static value in it
            renderFnId: string;
            lView: LView;
        }
        | {
            type: LViewEntryType.Else;
            anchor: HTMLDivElement;
            native: HTMLDivElement;
            ifEntry: LViewEntry & { type: LViewEntryType.If };
            renderFnId: string;
            lView: LView;
        }
        | {
            type: LViewEntryType.Text;
            native: Text;
            binding: Binding;
        }
        | {
            type: LViewEntryType.Component; // currently just using containers as a root node for components
            native: HTMLDivElement;
            instance: any; // the actual instantiation of the class
            renderFnId: string;
            lView: LView;
        }
    );

type LViewBlockEntries = Extract<
    LViewEntry,
    {
        type:
        | LViewEntryType.If
        | LViewEntryType.Element
        | LViewEntryType.Else
        | LViewEntryType.Component;
    }
>;

type LView = Array<LViewEntry>;

type RenderingState = {
    parent: LViewBlockEntries | null;
    lView: LView;
    ctx: any | null; // the instance of the class being rendered, it will be used to evaluate expressions
    lastIf: (LViewEntry & { type: LViewEntryType.If }) | null;
};

const rootLView: LView = [];

const initialRenderingState: RenderingState = {
    parent: null, // the immediate parent, which could be any kind of node
    lView: rootLView,
    ctx: null,
    lastIf: null,
};
const stateStack: Array<RenderingState> = [initialRenderingState];

export const setRootElement = (element: HTMLElement) => {
    initialRenderingState.parent = {
        type: LViewEntryType.Element,
        native: element,
        attributes: new Map(),
        events: new Map(),
        index: null,
        parent: null,
    };
};

const getState = () => {
    const mostRecentState = stateStack.at(-1);
    assert(
        !!mostRecentState,
        "Attemted to get rendering state but the stack was empty",
    );

    return mostRecentState;
};
const popParent = () => {
    const state = getState();
    state.parent = state.parent?.parent ?? null;
};

const createComponent = (index: number, selector: string, renderFnId: string) => {
    const native = document.createElement("div");
    native.style = "display: contents;";
    native.setAttribute("data-directive-type", selector);

    const { componentClass } = getComponentMeta(selector);
    const instance = new componentClass();
    const { parent, lView } = getState();

    assert(
        !!parent?.native,
        "Attempted to create a component but no parent native element found",
    );

    parent.native.appendChild(native);

    const instanceLView: LView = [];
    const componentNode = {
        type: LViewEntryType.Component,
        native,
        index,
        parent,
        instance,
        renderFnId,
        lView: instanceLView,
    } as LViewEntry & { type: LViewEntryType.Component };

    lView[index] = componentNode;

    stateStack.push({
        lView: instanceLView,
        parent: componentNode,
        ctx: instance,
        lastIf: null,
    });

    if ("ngOnInit" in instance && typeof instance.ngOnInit === "function") {
        instance.ngOnInit();
    }

    callRenderFn(renderFnId, true);
};

const enterComponent = (index: number) => {
    const { lView } = getState();
    const subComponent = lView[index] as LViewEntry & {
        type: LViewEntryType.Component;
    };

    stateStack.push({
        lView: subComponent.lView,
        parent: subComponent,
        ctx: subComponent.instance,
        lastIf: null,
    });

    callRenderFn(subComponent.renderFnId, false);
};

const closeComponent = () => {
    stateStack.pop();
    console.log(stateStack);
};

const createElement = (index: number, tag: string) => {
    const native = document.createElement(tag);
    const state = getState();

    assert(
        !!state.parent?.native,
        "Attempted to create an element but no parent native element found",
    );
    state.parent.native.appendChild(native);

    const elementNode: Extract<LViewEntry, { type: LViewEntryType.Element }> = {
        parent: state.parent,
        index,
        type: LViewEntryType.Element,
        native,
        attributes: new Map(),
        events: new Map(),
    };

    state.parent = elementNode;
    state.lView[index] = elementNode;
};

const enterElement = (index: number) => {
    const state = getState();
    const element = state.lView[index] as LViewEntry & {
        type: LViewEntryType.Element;
    };
    state.parent = element;
};

const createEvent = (name: string, value: string) => {
    const { parent, ctx } = getState();
    assert(
        parent?.type === LViewEntryType.Element,
        "Tried to set an event but not in an element",
    );
    assert(
        !!parent?.native,
        "Tried to set an event but found no parent DOM element",
    );
    assert(!!ctx, "Failed to find a parent component while creating an event");
    const callback = new Function(value);
    parent.native.addEventListener(name, callback.bind(ctx));
};

const createAttribute = (name: string, value: string, isBound: boolean) => {
    const { parent } = getState();
    assert(
        parent?.type === LViewEntryType.Element,
        "Tried to set an attribute but was not in an element!",
    );

    if (isBound) {
        const expression = Function(`return ${value}`);
        const evaluatedValue = evaluate(expression);
        const binding: Binding = {
            static: false,
            expression,
            lastValue: evaluatedValue,
        };
        parent.attributes.set(name, binding);
        parent.native.setAttribute(name, evaluatedValue);
    } else {
        // if its not bound, set it once on creation and forget about it, no need to add to lView
        parent.native.setAttribute(name, value);
    }
};

const updateAttribute = (name: string) => {
    const { parent } = getState();
    assert(
        parent?.type === LViewEntryType.Element,
        "Tried to set an attribute but was not in an element!",
    );

    const attribute = parent.attributes.get(name);
    assert(
        !!attribute,
        `Tried to set an attribute ${name} but it wasn't on the element`,
    );

    setBinding(attribute, (value: any) =>
        parent.native.setAttribute(name, value),
    );
};

const closeElement = (tag: string) => {
    const { parent } = getState();
    assert(
        parent?.type === LViewEntryType.Element,
        "Tried to close an element but wasnt in one.",
    );

    const nativeTagName = parent?.native.tagName.toLowerCase();
    assert(
        nativeTagName === tag.toLowerCase(),
        `Unexpected closing ${tag} tag.`,
    );

    popParent();
};

const createText = (index: number, value: string, isBound: boolean) => {
    const { lView, parent } = getState();
    assert(!!parent?.native, "No parent element to append text to.");

    const native = document.createTextNode(value);
    parent.native.appendChild(native);

    let binding: Binding;
    if (isBound) {
        const expression = Function(`return ${value};`);
        const evaluatedValue = evaluate(expression);
        native.textContent = evaluatedValue;
        binding = { static: false, expression, lastValue: evaluatedValue };
    } else {
        binding = { static: true, value };
    }

    const textNode: Extract<LViewEntry, { type: LViewEntryType.Text }> = {
        parent,
        native,
        index,
        type: LViewEntryType.Text,
        binding,
    };

    lView[index] = textNode;
    parent.native.appendChild(native);
};

const updateText = (index: number) => {
    const { lView } = getState();
    const textNode = lView[index] as LViewEntry & { type: LViewEntryType.Text };
    const updateText = (newText: string) =>
        (textNode.native.nodeValue = newText);
    setBinding(textNode.binding, updateText);
};

const createIf = (index: number, bindExpression: string, renderFnId: string) => {
    const anchor = document.createElement("div");
    anchor.style = "display: contents;";
    anchor.setAttribute("data-anchor", "if");

    const native = document.createElement("div");
    native.style = "display: contents;";
    native.setAttribute("data-directive-type", "if");

    anchor.appendChild(native);

    const state = getState();
    const { lView, parent } = state;
    assert(
        !!parent?.native,
        "Attempted to create an if but no parent native element to append to",
    );

    parent.native.appendChild(anchor);

    const expression = Function(`return ${bindExpression};`);
    const evaluatedValue = !!evaluate(expression);
    const ifNode: Extract<LViewEntry, { type: LViewEntryType.If }> = {
        binding: { static: false, expression, lastValue: evaluatedValue },
        parent,
        native,
        anchor,
        index,
        type: LViewEntryType.If,
        renderFnId,
    };

    lView[index] = ifNode;
    state.parent = ifNode;
    state.lastIf = ifNode;

    callRenderFn(renderFnId, true);
};

const enterConditional = (index: number) => {
    const state = getState();
    const node = state.lView[index] as LViewEntry & {
        type: LViewEntryType.If | LViewEntryType.Else;
    };
    state.parent = node;

    let activated: boolean;
    if (node.type === LViewEntryType.If) {
        activated = !!setBinding(node.binding);
    } else {
        activated = !node.ifEntry.binding.lastValue;
    }

    const attached = !!node.anchor.hasChildNodes();
    if (activated && !attached) {
        node.anchor.appendChild(node.native);
    } else if (!activated && attached) {
        node.native.remove();
    }

    if (activated) {
        callRenderFn(node.renderFnId, false);
    }

    popParent();
};

const createElse = (index: number, renderFnId: string) => {
    const state = getState();
    const { lView, lastIf } = state;

    assert(!!lastIf, "Tried to create an else but was not after an if.");

    const parent = lastIf.parent;
    assert(
        !!parent?.native,
        "Attempted to create an else but no parent native element found to append to",
    );

    const anchor = document.createElement("div");
    anchor.style = "display: contents;";
    anchor.setAttribute("data-anchor", "if");

    const native = document.createElement("div");
    native.style = "display: contents;";
    native.setAttribute("data-directive-type", "if");

    anchor.appendChild(native);

    const elseNode: Extract<LViewEntry, { type: LViewEntryType.Else }> = {
        parent,
        native,
        anchor,
        index,
        type: LViewEntryType.Else,
        ifEntry: lastIf,
        renderFnId,
    };

    lView[index] = elseNode;
    state.parent = elseNode;

    callRenderFn(renderFnId, true);
};

const callRenderFn = (id: string, createStage: boolean) => {
    if (!createStage) {
        debugger;
    }
    const renderFn = renderFnRegistry.get(id);
    assert(!!renderFn, 'Attempted to render a template but couldnt find its renderFn');

    renderFn(createStage);
};

const evaluate = (expression: (Binding & { static: false })["expression"]) => {
    const context = getState().ctx;
    return expression.bind(context)();
};

const setBinding = (
    binding: Binding,
    assignmentFn: (value: any) => void = (_) => { },
) => {
    if (binding.static) {
        assignmentFn(binding.value);

        return binding.value;
    } else {
        const nextVal = evaluate(binding.expression);
        if (nextVal !== binding.lastValue) {
            binding.lastValue = nextVal;
            assignmentFn(nextVal);
        }

        return binding.lastValue;
    }
};

export const instructions = {
    createText,
    updateText,
    createComponent,
    enterConditional,
    enterComponent,
    closeElement,
    closeComponent,
    createIf,
    createElse,
    createAttribute,
    updateAttribute,
    enterElement,
    createElement,
    createEvent,
    callRenderFn,
};
