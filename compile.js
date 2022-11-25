
// node.js imports
const fs = require('fs');
const util = require('util');
const path = require('node:path');

// library imports
const cheerio = require('cheerio');
const marked = require('marked');
const yargs = require('yargs');

// utility functions
async function copy_recursive(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && await fs.promises.stat(src);
    const is_directory = exists && stats.isDirectory();
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
    const exists = fs.existsSync(item);
    const stats = exists && await fs.promises.stat(item);
    const is_directory = exists && stats.isDirectory();
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

const regexp = /<<<(md|html):(.+)>>>|\{\{\{(.+)\}\}\}/;

async function parse(file_path, options) {

    console.log(`parsing template: ${file_path}`);
    const file_content = await fs.promises.readFile(file_path);
    const lines = file_content.toString().split('\n');

    for (let i = 0; i < lines.length; i++) {

        for (let match = lines[i].match(regexp), result; match;) {
            
            // <<<[md|html].+>>> for files
            if (match[0][0] === '<') {
                
                const relative_file = match[2].trim();

                switch (match[1]) {
                    
                    case 'md': {
                        console.log(`inserting md: ${relative_file}`);
                        const md = await fs.promises.readFile(relative_file, 'utf8');
                        const md_parsed = await marked.parse(md);
                        result = md_parsed;
                    } break;

                    
                    case 'html': {
                        result = await parse(relative_file, options);
                    } break;

                }
            }

            // {{{.+}}} for variables
            else {
                const variable_to_replace = match[3].trim();
                result = options[match[3].trim()];
                console.log(`replacing variable: ${variable_to_replace} => ${options[variable_to_replace]}`);
            }

            lines[i] = lines[i].replace(match[0], result ? result : '');
            match = lines[i].match(regexp);
        
        }
    
    }

    return lines.join('');
}

// this is the entrypoint of the the application,
// where the static site is actually generated
async function build_project(deps, pages) {

    // Prepare output folder
    const output_folder = './out/'
    if (fs.existsSync(output_folder)) {
        await fs.promises.rm(output_folder, { recursive: true, force: true });
    }
    await fs.promises.mkdir(output_folder, { recursive: true });


    // Process hard dependencies (aka, files that need to be copied to out)
    const dependencies = deps ?? [];

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

    // Process articles
    let markdown_files = [];
    await map_recursive('./articles', async (file) => {
        const file_name = path.parse(file).name;
        markdown_files.push({id: file_name, file: file});
    });

    // Process HTML files.
    // Basically take all HTML files and apply the changes required where necessary.
    // 1. Embed the Markdown content directly into the html
    let html_files = pages ?? [
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
                const template_text = inner_html.substring(length_of_header);
                const template_json = JSON.parse(template_text);
                let handled = false;

                console.log(`processing template: ${template_json.template}`);
                switch (template_json.template) {
                    
                    case "fancy_subtitle": {
                        const config = template_json.config;
                        $($(pre_code).parent()).replaceWith($(`<div class=${config.class}>${config.content}</div>`));
                        handled = true; modified = true;
                    } break;
                    
                    default: {
                        // If the name is not recognized, lets assume its an actual template file that
                        // needs to be parsed with the function `parse` above
                        const template_name = template_json.template;
                        const config = template_json.config;
                        const template_file_parsed = await parse(template_name, config)
                        $($(pre_code).parent()).replaceWith($(template_file_parsed));
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
            console.log('Processed page: ' + util.inspect(html_file));
            await fs.promises.writeFile(out_html, $.html());
        }
        else {
            console.log('Copied page: ' + util.inspect(html_file));
            await fs.promises.copyFile(html_file, out_html);
        }

    }

}

// Handle command
const argv = yargs.command('build', 'build the static site in ./out', {
    dependencies: {
        description:
            `An array of files or folders, which will be copied over to the output folder. They must be relative to the projects root`,
        type: 'array',
        requiresArg: true,
    },
    pages: {
        description:
            `An array of html files to be processed. Must be in the root of the folder.`,
        type: 'array',
        requiresArg: true,
    },
}).demandCommand(1, 1).argv;

switch (argv._[0]) {
    
    case 'build': {
        build_project(argv.dependencies, argv.pages);
    } break;
    
    default: {
        build_project();
    } break;

}
