const fs = require('fs');
const escape = require('markdown-escape')


fs.readFile('content.md', 'utf8', (err, data1) => {
    if (err) { console.error(err); return; }

    let content = data1;

    fs.readFile('template.js', 'utf8', (err, data2) => {
        if (err) { console.error(err); return; }

        let static_file = data2;
        let generated_file = static_file.replace(`HERE`, escape(content));

        fs.writeFile('generated.js', generated_file, err => {
            if (err) { console.error(err); return; }

            console.log("Finished!");
        });


    });
});
