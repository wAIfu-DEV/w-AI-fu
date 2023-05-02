const fs = require('fs');

main();
function main() {

    console.log('Launching ...');

    const readFlat = (path) => {
        return fs
            .readFileSync(path)
            .toString('utf-8')
            .replace(/\r/g, '')
            .replace(/\n+/g, '\n')
            .replace(/\n$/g, '');
    };

    const char_name = readFlat('name.txt');
    const user_name = readFlat('user_name.txt');
    const voice = readFlat('voice.txt');
    const char_persona = readFlat('description.txt');
    const example_dialogue = readFlat('personality.txt');
    
    const out = JSON.stringify({
        "char_name": char_name,
        "user_name": user_name,
        "voice": voice,
        "char_persona": char_persona,
        "example_dialogue": example_dialogue
    });

    console.log('Writing file ...');
    fs.writeFileSync(`../${char_name}.json`, out);

    console.log('Finished.');
}