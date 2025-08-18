import { Component } from './src/component-registration';
import { bootstrapApplication } from './src/main';

const rootElement = document.getElementById('app')!;

@Component({
    selector: 'main',
    template: `
        <h1>Hello World!</h1>
    `,
})
class MainComponent {}

bootstrapApplication(rootElement, MainComponent);
