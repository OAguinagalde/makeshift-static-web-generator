
// node.js imports
const fs = require('fs');
const util = require('util');
const cheerio = require('cheerio');
const marked = require('marked');
const path = require('node:path');


// library imports
const escape = require('markdown-escape')


// utility functions
async function copy_recursive(src, dest) {
    var exists = fs.existsSync(src);
    var stats = exists && await fs.promises.stat(src);
    var is_directory = exists && stats.isDirectory();
    if (is_directory) {
        await fs.promises.mkdir(dest);
        const files = await fs.promises.readdir(src);
        for (let i = 0; i < files.length; i++) {
            await copy_recursive(
                path.join(src, files[i]),
                path.join(dest, files[i])
            );
        }
    }
    else {
        await fs.promises.copyFile(src, dest);
    }
};

async function map_recursive(item, f) {
    var exists = fs.existsSync(item);
    var stats = exists && await fs.promises.stat(item);
    var is_directory = exists && stats.isDirectory();
    if (is_directory) {
        const files = await fs.promises.readdir(item);
        for (let i = 0; i < files.length; i++) {
            await map_recursive(path.join(item, files[i]), f);
        }
    }
    else {
        await f(item);
    }
};


async function build_project() {

    // Prepare output folder
    const output_folder = './out/'
    if (fs.existsSync(output_folder)) {
        await fs.promises.rm(output_folder, { recursive: true, force: true });
    }
    await fs.promises.mkdir(output_folder, { recursive: true });


    // Process hard dependencies (aka, files that need to be copied to out)
    const dependencies = [
        './src/',
    ];

    for (let i = 0; i < dependencies.length; i++) {

        const dep_origin = dependencies[i];
        const dep_origin_info = await fs.promises.lstat(dep_origin);
        const dep_target = path.normalize(output_folder + dep_origin);

        if (dep_origin_info.isDirectory()) {
            await copy_recursive(dep_origin, dep_target);
        }
        
        else {
            const dep_target_directory = path.dirname(dep_target);
            await fs.promises.mkdir(dep_target_directory, { recursive: true });
            await fs.promises.copyFile(dep_origin, dep_target);
        }
    }

    // Process markdown_content
    let markdown_files = [];
    await map_recursive('./markdown_content', async (file) => {
        const file_name = path.parse(file).name;
        markdown_files.push({id: file_name, file: file});
    });

    // Process HTML files.
    // Basically take all HTML files and apply the changes required where necessary.
    // 1. Embed the Markdown content directly into the html
    const html_files = [
        './index.html',
    ];

    for (let i = 0; i < html_files.length; i++) {

        const html_file = html_files[i];
        const html = await fs.promises.readFile(html_file, 'utf8');
        let modified = false;
        let $ = cheerio.load(html);
        
        // embed markdown contents in articles
        for (let article of $('article')) {
            const id = article.attribs['id'];
            const markdown_file = id && markdown_files.find((item) => item.id === id)
            if (markdown_file) {
                const md = await fs.promises.readFile(markdown_file.file, 'utf8');
                const md_parsed = await marked.parse(md);
                $(md_parsed).appendTo(article);
                modified = true;
            }
        }

        // process templates
        const length_of_header = '/*template*/\n'.length;
        for (let pre_code of $('pre code')) {
            const inner_html = $(pre_code).html()
            if (inner_html.startsWith('/*template*/')) {
                let template_text = inner_html.substring(length_of_header);
                let template_json = JSON.parse(template_text);
                let handled = false;

                switch (template_json.template) {
                    case "fancy_subtitle": {
                        const config = template_json.config;
                        $($(pre_code).parent()).replaceWith($(`<div style="text-align: ${config.position};">${config.content}<div>`));
                        handled = true; modified = true;
                    } break;
                }

                if (!handled) {
                    $(pre_code).remove()
                }
            }
        }

        const out_html = path.normalize(output_folder + html_file);

        if (modified) {
            console.log('Processed ' + util.inspect(html_file));
            await fs.promises.writeFile(out_html, $.html());
        }
        else {
            console.log('Copying ' + util.inspect(html_file));
            await fs.promises.copyFile(html_file, out_html);
        }

    }

}

build_project();