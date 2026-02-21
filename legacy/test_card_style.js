const fs = require('fs');
const vm = require('vm');

try {
    const code = fs.readFileSync('./ui-components.js', 'utf8');

    const sandbox = {
        window: {},
        document: {
             createElement: () => ({ firstElementChild: {} })
        },
        console: { log: () => {} } // silence logs
    };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);

    const Card = sandbox.window.Card;

    if (!Card) {
        console.error('Card component not found in window object');
        process.exit(1);
    }

    const styleValue = 'border: 1px solid red;';
    const card = new Card({
        title: 'Test',
        style: styleValue
    });

    const html = card.renderHTML();
    console.log('Generated HTML:', html);

    if (html.includes(`style="${styleValue}"`)) {
        console.log('PASS: Style prop rendered');
    } else {
        console.log('FAIL: Style prop not rendered');
    }

} catch (e) {
    console.error('Error running test:', e);
}
