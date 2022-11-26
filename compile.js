
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

const regexp = /<<<(md|html|c):(.+)>>>|\{\{\{(.+)\}\}\}/;

async function parse(input, is_file, options) {

    let data_to_parse;
    if (is_file) {
        console.log(`parsing template: ${input}`);
        data_to_parse = await fs.promises.readFile(input);
    }
    else {
        console.log(`parsing text: ${input.substring(0,50).replace(/(?:\r\n|\r|\n)/g,"")}...`);
        data_to_parse = input;
    }
    const lines = data_to_parse.toString().split('\n');

    for (let i = 0; i < lines.length; i++) {

        for (let match = lines[i].match(regexp), result; match;) {
            
            if (match[0][0] === '<') {
                
                const relative_file = match[2].trim();

                switch (match[1]) {
                    
                    case 'md': {
                        const md = await fs.promises.readFile(relative_file, 'utf8');
                        const md_parsed = await marked.parse(md);
                        result = md_parsed;
                    } break;

                    case 'c': {
                        if (relative_file === 'inner') {
                            result = '<innermarker></innermarker>'
                        }
                    } break;
                    
                    case 'html': {
                        result = await parse(relative_file, true, options);
                    } break;

                }
            }

            else {
                const content = match[3].trim();
                const [ variable, index, sub_variable ] = content.split(":", 3);
                
                if (index && sub_variable) {
                    
                    result = options[variable][index][sub_variable];
                }
                else {
                    result = options[variable];
                }
            }

            console.log(`replacing ${match[0]} with ${result.substring(0, 50).replace(/(?:\r\n|\r|\n)/g,"")}...`);
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
        
        // Find every tag of type article and do whatever needs to be done with it
        for (let article = $('article').first(); article;) {
        
            // mark the article as handled, so that it is not handled twice
            $(article).attr('handled', 'true');
        
            // For now, the id of the article is expected to be a relative path to an actual file
            // of type json or md. Example: <article id="some/file.json"/>
            const file_path = $(article).attr('id');
            if (fs.existsSync(file_path)) {
            
                // Parse the file name to be able to to get its extension
                const file = path.parse(file_path);
                switch (file.ext) {
                    
                    // If its a markdown file:
                    // 1. load the file
                    // 2. check if it has any special tag <<<...>>> or {{{...}}} and replace it
                    // 3. conver it into html
                    // 4. put it back into the final html page
                    case ".md": {
                        const md = await fs.promises.readFile(file_path, 'utf8');
                        const template_file_parsed = await parse(md, false, {})
                        const md_parsed = await marked.parse(template_file_parsed);
                        
                        const inner_elements = $(article).html();
                        $(article).children().remove()
                        $(md_parsed).appendTo(article);

                        // Used for when we want to keep the inner html of the article tag: <article> innerstuff </article>
                        $('innermarker').replaceWith(inner_elements)

                        modified = true;
                    } break;
                    
                    // If its a json file:
                    // 1. load the file
                    // 2. parse the json
                    // 3. it should contain both a "template" and a "config" fields
                    // 4. Load the template file and pass the config as options.
                    // 5. put it back into the final html page
                    case ".json": {
                        const json = await fs.promises.readFile(file_path, 'utf8');
                        const json_parsed = await JSON.parse(json);
                        const template_name = json_parsed.template;
                        const config = json_parsed.config;
                        const template_file_parsed = await parse(template_name, true, config)
                        $(template_file_parsed).appendTo(article);
                        modified = true;
                    } break;
                }
                
            }

            // check if there is any article tag left to handle
            const left_to_handle = $('article').filter(function (i, el) {
                return $(this).attr('handled') !== 'true';
            })

            if (left_to_handle.length > 0) {
                article = left_to_handle.first();
            }
            else {
                break;
            }
        }

        // process templates embeded in markdown files
        const length_of_header = '/*template*/'.length;
        for (let pre_code of $('pre code')) {
            const inner_html = $(pre_code).html()
            if (inner_html.startsWith('/*template*/')) {
                const template_text = inner_html.substring(length_of_header);
                const template_json = JSON.parse(template_text);
                let handled = false;

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
                        const template_file_parsed = await parse(template_name, true, config)
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
