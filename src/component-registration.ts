import type { Class } from "./utils";

// framework internal mappings for classes
export const componentBySelector = new Map<string, ComponentClass>();
export const componentMetaByClass = new Map<
    ComponentClass,
    ComponentMetadata
>();

export type ComponentMetadata = {
    selector: string;
    template: string;
};
export type ComponentClass = Class;

// This is the decorator which will register a class as a component
export const Component =
    (componentMetadata: ComponentMetadata) => (componentCtor: Class) => {
        if (componentBySelector.has(componentMetadata.selector)) {
            throw new Error(
                `${componentMetadata.selector} already exists, please give this component a unique selector.`,
            );
        }
        if (componentMetaByClass.has(componentCtor)) {
            throw new Error("Attempted to register a component class twice.");
        }

        componentBySelector.set(componentMetadata.selector, componentCtor);
        componentMetaByClass.set(componentCtor, componentMetadata);

        return componentCtor as ComponentClass;
    };
