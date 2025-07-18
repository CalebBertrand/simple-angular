// This example only simulates a simple version of angular, using only stanalone (root provided) components and no modules

// helper type for describing an uninstantiated class
interface Class<T = unknown> extends Function {
  new (...args: any[]): T;
}

// framework internal mappings for classes
const componentBySelector = new Map<string, ComponentClass>();
const componentMetaByClass = new Map<ComponentClass, ComponentMetadata>();

// framework internal view structure. Its a giant array of all values bound in the app,
// along with the element related to that binding, if relevant. Some bindings, like plain text,
// will not have a dom node. And even bindings which do have nodes will interact with them differently,
// for example an attribute binding and an if statement binding.
const viewBindings: Array<{ value: unknown; domNode?: HTMLElement }> = [];

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
        `${componentMetadata.selector} already exists, please give this component a unique selector.`
      );
    }
    if (componentMetaByClass.has(componentCtor)) {
      throw new Error('Attempted to register a component class twice.');
    }

    componentBySelector.set(componentMetadata.selector, componentCtor);
    componentMetaByClass.set(componentCtor, componentMetadata);

    return componentCtor as ComponentClass;
  };

// Only lifecyle hooks I'll be supporting
export interface OnInit {
  ngOnInit(): void;
}
export interface AfterViewInit {
  ngAfterViewInit(): void;
}

// intended to run on whatever's between the opening and closing angle brackets
function isValidOpenOrSelfClosingTag(str: string) {
  str = str.trim();

  const isSelfClosing = str.endsWith('/');
  const inner = str.slice(1, isSelfClosing ? -2 : -1).trim();

  if (!inner) return false;

  const parts = inner.split(/\s+/);

  const tagName = parts[0];
  if (!isValidTagName(tagName)) return false;

  // Validate each attribute
  const attributes: Array<{ name: string; value?: string; }> = [];
  for (let i = 1; i < parts.length; i++) {
    const attr = parts[i];
    const attrValidation = isValidAttribute(attr);
    if (!attrValidation) return false;
    attributes.push(attrValidation);
  }

  return { tagName, isSelfClosing };
}

function isValidTagName(name: string) {
  if (!name) return false;
  const firstChar = name[0];
  if (!isAlpha(firstChar)) return false;
  return [...name].every((ch) => isAlphaNum(ch) || ch === '-' || ch === ':');
}

function isValidAttribute(attr: string) {
  // Allow: attr or attr="value"
  const eqIndex = attr.indexOf('=');
  if (eqIndex === -1) {
    return isValidTagName(attr) ? { name: attr, value: null } : false;
  }

  const name = attr.slice(0, eqIndex).trim();
  const value = attr.slice(eqIndex + 1).trim();

  if (!isValidTagName(name)) return false;
  if (!(value.startsWith('"') && value.endsWith('"'))) return false;

  return { name, value };
}

function isValidClosingTag(str: string) {
  const parts = str.split(/\s+/);
  if (parts.length !== 1) return false;
  if (!isAlphaNum(parts[0])) return false;
  return { tagName: parts[0] };
}

function isAlpha(ch: string) {
  return /^[A-Za-z]$/.test(ch);
}

function isAlphaNum(ch: string) {
  return /^[A-Za-z0-9]$/.test(ch);
}

const parseComponent = (component: ComponentClass) => {
  const meta = componentMetaByClass.get(component);
  if (!meta) {
    throw new Error('This class was not registered as a component.');
  }
  const template = meta.template;

  let index = 0;
  const tagStack = [];
  while (index < template.length) {
    const nextChar = template.charAt(index);

    if (nextChar.match('s')) {
      index++;
      continue;
    } else if (nextChar === '<') {
      const closingBracket = template.indexOf('>', index);
      if (closingBracket < 0) {
        index++;
        continue;
      }

      const openingValidation = isValidOpenOrSelfClosingTag(
        template.slice(index + 1, closingBracket)
      );

      // valid opening tag, skip to end and update stack as needed
      if (openingValidation) {
        const { isSelfClosing, tagName } = openingValidation;
        if (!isSelfClosing) {
          tagStack.push(tagName);
        }

        index = closingBracket + 1;
        continue;
      } 
      // check if it's a closing tag
      else {
        const closingValidation = isValidClosingTag(template.slice(index + 1, closingBracket));
        if (!closingValidation) {
          index++;
          continue;
        }

        const tagToClose = tagStack.pop();
        if (tagToClose !== closingValidation.tagName) {
          throw new Error(`Expected closing ${tagToClose} tag, found closing ${closingValidation.tagName}.`);
        }

        index = closingBracket + 1;
        continue;
      }      
    } else if () {

    }
  }
};

const compileApplication = <T extends ComponentClass>(rootComponent: T) => {
  return (component: ComponentClass) => {
    if ('ngOnInit' in component && typeof component.ngOnInit === 'function') {
      component.ngOnInit();
    }
    // simplified angular syntax parser

    if (
      'ngAfterViewInit' in component &&
      typeof component.ngAfterViewInit === 'function'
    ) {
      component.ngAfterViewInit();
    }
  };
};

// normally the app would have already been compiled before this, but I'm going to call the compiler inside this bootstrap
// function since I have no build system and doing this all "JIT".
export const bootstrapApplication = (
  element: HTMLElement,
  rootComponent: ComponentClass
) => {
  const renderer = compileApplication(rootComponent);

  element.appendChild(rootDOMElement);
};
