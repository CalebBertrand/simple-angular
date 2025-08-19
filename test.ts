import { Component } from './src/component-registration';
import { bootstrapApplication } from './src/main';

const rootElement = document.getElementById('app')!;

@Component({
    selector: 'main',
    template: `
        <h1>Hello World!</h1>
        <p>{{ this.text }}</p>
    `,
})
class MainComponent {
    text = 'This is some bound text';
}

bootstrapApplication(rootElement, MainComponent);
