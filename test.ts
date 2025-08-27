import { Component } from './src/component-registration';
import { bootstrapApplication } from './src/main';

const rootElement = document.getElementById('app')!;

@Component({
    selector: 'main',
    template: `
        <h1>Hello World!</h1>
        <p>{{ this.text }}</p>
        <button  (click)="addExclamation()">Make this exciting</button>
    `,
})
class MainComponent {
    text = 'This is some bound text';
    addExclamation() {
        this.text = this.text + '!';
    }
}

bootstrapApplication(rootElement, MainComponent);
