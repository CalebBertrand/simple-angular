// This example only simulates a simple version of angular, using only stanalone (root provided) components and no modules

import type { ComponentClass } from "./component-registration";
import { parseComponent } from "./template-parser";

// Only lifecyle hooks I'll be supporting
export interface OnInit {
  ngOnInit(): void;
}
export interface AfterViewInit {
  ngAfterViewInit(): void;
}
export type SimpleChanges = {
  [input: string]: { previousValue: unknown; currentValue: unknown };
};
export interface OnChanges {
  ngOnChanges(changes: SimpleChanges): void;
}

const compileApplication = <T extends ComponentClass>(rootComponent: T) => {
  const rootViewNode = parseComponent(rootComponent);

  return (component: ComponentClass) => {
    if ("ngOnInit" in component && typeof component.ngOnInit === "function") {
      component.ngOnInit();
    }
    // simplified angular syntax parser

    if (
      "ngAfterViewInit" in component &&
      typeof component.ngAfterViewInit === "function"
    ) {
      component.ngAfterViewInit();
    }
  };
};

// normally the app would have already been compiled before this, but I'm going to call the compiler inside this bootstrap
// function since I have no build system and doing this all "JIT".
export const bootstrapApplication = (
  element: HTMLElement,
  rootComponent: ComponentClass,
) => {
  const renderer = compileApplication(rootComponent);

  element.appendChild(rootDOMElement);
};
