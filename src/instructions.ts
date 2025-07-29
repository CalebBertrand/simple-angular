import { getComponentMeta } from "./component-registration";
import type { ComponentViewNode, ViewNodeAttribute, ViewNodeTypes } from "./template-parser";

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
      }
    | {
          type: LViewEntryType.If;
          native: Comment;
          binding: Binding & { static: false }; // technically this could be optimized to cover the case when an if statement has a static value in it
      }
    | {
          type: LViewEntryType.Else;
          native: Comment;
          ifEntry: LViewEntry & { type: LViewEntryType.If };
      }
    | {
          type: LViewEntryType.Text;
          native: Text;
          binding: Binding;
      }
    | {
          type: LViewEntryType.Component; // currently just using containers as a root node for components
          native: Comment;
          instance: any; // the actual instantiation of the class
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
};
const renderingState: RenderingState = {
    parent: null, // the immediate parent, which could be any kind of node
    lView: [],
    ctx: null,
};

export const createComponent = (index: number, selector: string) => {
    const native = document.createComment(`<__${selector}__start__>`);
    const lView: Array<LViewEntry> = [];
    const { componentClass } = getComponentMeta(selector);
    const instance = new componentClass();
    const componentNode = {
        type: LViewEntryType.Component,
        native,
        index,
        parent: renderingState.parent,
        instance,
        lView
    } as LViewEntry & { type: LViewEntryType.Component };

    renderingState.lView[index] = componentNode;

    renderingState.lView = lView;
    renderingState.parent = componentNode;
    renderingState.ctx = instance;
};

export const enterComponent = (index: number) => {
    const subComponent = renderingState.lView[index] as LViewEntry & { type: LViewEntryType.Component; };
    renderingState.lView = subComponent.lView;
    renderingState.parent = subComponent;
    renderingState.ctx = subComponent.instance;
};

export const closeComponent = ()

export const createElement = (index: number, tag: string) => {
    if (isInDeactivatedRegion()) {
        return;
    }

    const native = document.createElement(tag);
    const parent = renderingState.parent;

    const elementNode: Extract<LViewEntry, { type: LViewEntryType.Element }> = {
        parent,
        index: null,
        type: LViewEntryType.Element,
        native,
        attributes: new Map(),
    };

    renderingState.parent = elementNode;
};

export const createAttribute = (
    name: string,
    value: string,
    isBound: boolean,
) => {
    if (isInDeactivatedRegion()) {
        return;
    }

    const { parent } = renderingState;
    if (parent?.type !== LViewEntryType.Element) {
        throw new Error("Tried to set an attribute but was not in an element!");
    }

    if (isBound) {
        const expression = Function(`return ${value};`);
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

export const updateAttribute = () => {
    const { parent } = renderingState;
    if (parent?.type !== LViewEntryType.Element) {
        throw new Error("Tried to set an attribute but was not in an element!");
    }

    parent?.
};

export const closeElement = (tag: string) => {
    if (isInDeactivatedRegion()) {
        return;
    }

    const parent = renderingState.parent;
    if (
        parent?.type !== LViewEntryType.Element ||
        parent.native.tagName !== tag
    ) {
        throw new Error(`Unexpected closing ${tag} tag.`);
    }

    renderingState.parent = parent.parent;
};

export const createText = (value: string, isBound: boolean) => {
    if (isInDeactivatedRegion()) {
        return;
    }

    const lView = renderingState.lView;
    const parent = renderingState.parent;
    if (
        !parent ||
        (parent.type !== LViewEntryType.Element &&
            parent.type !== LViewEntryType.If)
    ) {
        throw new Error("No parent element to append text to.");
    }

    const native = document.createTextNode(value);

    let binding: Binding;
    if (isBound) {
        const expression = Function(`return ${value};`);
        const evaluatedValue = evaluate(expression).toString();
        native.textContent = evaluatedValue;
        binding = { static: false, expression, lastValue: evaluatedValue };
    } else {
        binding = { static: true, value };
    }

    const textNode: Extract<LViewEntry, { type: LViewEntryType.Text }> = {
        parent,
        native,
        index: isBound ? lView.length : null,
        type: LViewEntryType.Text,
        binding,
    };

    if (isBound) {
        lView.push(textNode);
    }

    parent.native.appendChild(native);
};

export const createIf = (bindExpression: string) => {
    if (isInDeactivatedRegion()) {
        return;
    }

    const lView = renderingState.lView;
    const parent = renderingState.parent;
    if (
        !parent ||
        (parent.type !== LViewEntryType.Element &&
            parent.type !== LViewEntryType.If)
    ) {
        throw new Error("No parent element to append text to.");
    }

    const native = document.createComment(`<__if__ bind="${bindExpression}">`);
    const expression = Function(`return ${bindExpression};`);
    const evaluatedValue = !!evaluate(expression);
    const ifNode: Extract<LViewEntry, { type: LViewEntryType.If }> = {
        binding: { static: false, expression, lastValue: evaluatedValue },
        parent,
        native,
        index: lView.length,
        type: LViewEntryType.If,
    };

    lView.push(ifNode);
    renderingState.parent = ifNode;
};

export const createElse = () => {
    const lView = renderingState.lView;
    if (isInDeactivatedRegion()) {
        return;
    }

    const ifNode = renderingState.parent;
    if (ifNode?.type !== LViewEntryType.If) {
        throw new Error("Tried to create an else but was not in an if.");
    }

    const parent = ifNode.parent!;
    const native = document.createComment(`<__else__>`);
    const elseNode: Extract<LViewEntry, { type: LViewEntryType.Else }> = {
        parent,
        native,
        index: lView.length,
        type: LViewEntryType.Else,
        ifEntry: ifNode,
    };

    lView.push(elseNode);
    renderingState.parent = elseNode;
};

export const closeIf = () => {
    if (isInDeactivatedRegion()) {
        return;
    }

    const parent = renderingState.parent;
    if (
        parent?.type !== LViewEntryType.If &&
        parent?.type !== LViewEntryType.Else
    ) {
        throw new Error("Tried to close an if but we were not in an if block.");
    }

    renderingState.parent = parent.parent;
};

const evaluate = (expression: (Binding & { static: false })["expression"]) =>
    expression.bind(renderingState.ctx)();

const isInDeactivatedRegion = () => {
    const parent = renderingState.parent;
    if (!parent) return false;
    if (parent.type === LViewEntryType.If) return !parent.binding.lastValue;
    if (parent.type === LViewEntryType.Else)
        return parent.ifEntry.binding.lastValue;
    return false;
};

const setBinding = (binding: Binding, assignmentFn: (value: any) => void) => {
    if (binding.static) {
        assignmentFn(binding.value);
    } else {
        const nextVal = evaluate(binding.expression);
        if (nextVal !== binding.lastValue) {
            binding.lastValue = nextVal;
            assignmentFn(nextVal);
        }
    }
};
