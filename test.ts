import { Component } from "./src/component-registration";
import { bootstrapApplication } from "./src/main";

const rootElement = document.getElementById("app")!;

@Component({
    selector: "main",
    template: `
        <h1>Hello World!</h1>
        @if (!this.hidden) {
            <p>{{ this.text }}</p>
        }
        <p>
            And this is in uppercase: <br />
            {{ this.text.toUpperCase(); }}
        </p>
        <button (click)="this.addExclamation()">Make this exciting</button>
        <button (click)="this.hidden = !this.hidden">Toggle if</button>
        <p>{{ this.hidden }}</p>
    `,
})
class MainComponent {
    hidden = false;
    text = "This is some bound text";
    addExclamation() {
        this.text = this.text + "!";
    }
}

bootstrapApplication(rootElement, MainComponent);
