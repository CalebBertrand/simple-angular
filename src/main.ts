// This example only simulates a simple version of angular, using only stanalone (root provided) components and no modules

import { createRenderFn } from "./emitter";
import { setRootElement } from "./instructions";
import { parseComponent } from "./template-parser";
import type { Class } from "./utils/Class";
import { instructions } from './instructions';

// Only lifecyle hooks I'll be supporting
export interface OnInit {
    ngOnInit(): void;
}

const compileApplication = <T extends Class>(rootComponent: T, rootElement: HTMLElement) => {
    // get the AST
    const rootViewNode = parseComponent(rootComponent);

    // set root element which the instructions will use to build off of
    setRootElement(rootElement);
    
    // build the render function
    return createRenderFn(rootViewNode);
};

// normally the app would have already been compiled before this, but I'm going to call the compiler inside this bootstrap
// function since I have no build system and doing this all "JIT".
export const bootstrapApplication = (
    element: HTMLElement,
    rootComponent: Class,
) => {
    const renderer = compileApplication(rootComponent, element);

    // initialize (render in create mode)
    renderer(true);

    // mini zone js
    const refresh = () => renderer(false);
    window.addEventListener('click', refresh, true);

    const baseSetTimeout = window.setTimeout;
    window.setTimeout = (fn, ms) => {
        const patchedFn = () => {
            refresh();
            (fn as Function)();
        };
        return baseSetTimeout(patchedFn, ms);
    };

    const baseSetInterval = window.setTimeout;
    window.setInterval = (fn, ms) => {
        const patchedFn = () => {
            refresh();
            (fn as Function)();
        };
        return baseSetInterval(patchedFn, ms);
    };

};
