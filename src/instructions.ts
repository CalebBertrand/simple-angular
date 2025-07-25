import type { ViewNodeAttribute } from "./template-parser";

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
    Container,
    Element,
    If,
    Else,
    Text,
    Attribute,
}

type LViewEntry = {
    index: number | null; // it could be null if its not stored in the lView (such as completely static content)
    parent: LViewBlockEntries | null;
} & (
    | {
          type: LViewEntryType.Element;
          native: HTMLElement;
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
          type: LViewEntryType.Container;
          native: Comment;
          index: 0;
      }
    | {
          type: LViewEntryType.Attribute;
          binding: Binding & { static: false };
      }
);

type LViewBlockEntries = Extract<
    LViewEntry,
    {
        type:
            | LViewEntryType.If
            | LViewEntryType.Element
            | LViewEntryType.Else
            | LViewEntryType.Container;
    }
>;
type RenderingState = {
    parent: LViewBlockEntries | null;
    lView: Array<LViewEntry>;
    ctx: any | null; // the instance of the class being rendered, it will be used to evaluate expressions
};
const renderingState: RenderingState = {
    parent: null,
    lView: [],
    ctx: null,
};

export const createComponent = (selector: string, ctx: any) => {
    const native = document.createComment(`<__${selector}__start__>`);
    const lView: Array<LViewEntry> = [];

    renderingState.lView = lView;
    renderingState.parent = {
        type: LViewEntryType.Container,
        native,
        index: 0,
        parent: null,
    };
    renderingState.ctx = ctx;

    return lView as ReadonlyArray<LViewEntry>;
};

export const enterComponent = (ctx: any, lView: Array<LViewEntry>) => {
    if (!lView.length) {
        throw new Error(
            "An already initialized lView should always have at least one root node",
        );
    }

    renderingState.lView = lView;
    renderingState.parent = lView[0] as LViewEntry & {
        type: LViewEntryType.Container;
    };
    renderingState.ctx = ctx;
};

export const createElement = (tag: string) => {
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

    const { lView, parent } = renderingState;
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
        lView.push({
            type: LViewEntryType.Attribute,
            binding,
            parent,
            index: lView.length,
        });

        parent.native.setAttribute(name, evaluatedValue);
    } else {
        // if its not bound, set it once on creation and forget about it, no need to add to lView
        parent.native.setAttribute(name, value);
    }
};

export const updateAttribute = (index: number) => {
    const entry = renderingState.lView[index];
    if (entry.type !== LViewEntryType.Attribute) {
        throw new Error('Attempted to update attribute, but index did not point to one.');
    }

    entry.parent?.native
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
    if (parent.type === LViewEntryType.Element) return true; // not supporting component slots yet, so by default ignore everything in them
    return false;
};
