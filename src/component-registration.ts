import type { ComponentViewNode } from "./template-parser";
import type { Class } from "./utils";

type ComponentMetadata = {
    selector: string;
    template: string;
};
type InternalComponentMetadata = ComponentMetadata & {
    ast: ComponentViewNode | null;
    componentClass: ComponentClass;
};

export const COMPONENT_META = Symbol('angular_component_metadata');
type ComponentClass = Class & {
    [COMPONENT_META]: InternalComponentMetadata;
};

const metaBySelector = new Map<string, InternalComponentMetadata>();

// This is the decorator which will register a class as a component
export const Component =
    (componentMetadata: ComponentMetadata) => (componentCtor: Class) => {
        const meta = {
            ...componentMetadata,
            ast: null,
            componentClass: componentCtor as any,
        };
        (componentCtor as any)[COMPONENT_META] = meta;
        metaBySelector.set(componentMetadata.selector, meta);

        return componentCtor as ComponentClass;
    };

// mostly useful for instructions to get context about the component from a simple string selector
export const getComponentMeta = (selector: string) => {
    const meta = metaBySelector.get(selector);
    if (!meta) {
        throw new Error(`Tried to get ${selector} meta but it hadnt been registered.`);
    }
    return meta;
}
