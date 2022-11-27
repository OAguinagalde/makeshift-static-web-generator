
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

const regexp = /<<<(.+)>>>|\{\{\{(.+)\}\}\}/;

// Either html files or html string! (allows inclusion of custom <section> tags and custom injectors)
async function parse(input, options) {

    let data_to_parse;

    // Check if input is a file, or just a string
    if (fs.existsSync(input)) {
        console.log(`Parsing file: ${input}`);
        data_to_parse = await fs.promises.readFile(input);
    }
    else {
        let preview_of_input_singleline = input.substring(0,150).replace(/(?:\r\n|\r|\n)/g,"");
        console.log(`Parsing text: ${preview_of_input_singleline}...`);
        data_to_parse = input;
    }

    // data_to_parse should be html here already...
    let $ = cheerio.load(data_to_parse);

    // expand template tags
    const get_template_tag = () => {
        // WARNING! the filter function has to be a `function () {}` and not an `() => {}` because F***g javascript.
        let template = $('section[class=template]').first();
        return template.length > 0 ? template : undefined;
    }

    for (let template = get_template_tag(); template; template = get_template_tag()) {
        const inner_html = $(template).html();
        const input_file = $(template).attr('input');
        const template_file = $(template).attr('template');

        // Parse the file name to be able to to get its extension
        const input = await fs.promises.readFile(input_file, 'utf8');
        const json = await JSON.parse(input);
        
        let result = await parse(template_file, json);

        // Remove the original article tag fully and replace it with the processed content
        template.replaceWith($(result))

        // If the template contains any <section class='innermarker'/> tag, put back the old innter html where it is
        const inner_marker = $('section[class=innermarker]').first();
        if (inner_marker.length > 0) {
            inner_marker.replaceWith(inner_html);
        }

    }
    
    // expand repeat tags
    const get_repeat_tag = () => {
        // WARNING! the filter function has to be a `function () {}` and not an `() => {}` because F***g javascript.
        let repeat = $('section[class=repeat]').first();
        return repeat.length > 0 ? repeat : undefined;
    }

    let repeated = {}

    for (let repeat = get_repeat_tag(); repeat; repeat = get_repeat_tag()) {
        const repeated_html = $(repeat).html();
        const parameters_array_name = $(repeat).attr('parameters');
        const repeat_times = options[parameters_array_name].length;

        repeated[parameters_array_name] = {
            times: 0,
            processed: []
        }

        let total_html = "";
        for(let i = 0; i < repeat_times; i++) total_html += repeated_html;

        $(repeat).replaceWith($(total_html));
    }

    data_to_parse = $('body').html()

    // Line by line, find custom tags and process them
    const lines = data_to_parse.toString().split('\n');
    for (let i = 0; i < lines.length; i++) {

        for (let match = lines[i].match(regexp), result; match;) {
            
            if (match[0][0] === '<') {
                
                const relative_file = match[1].trim();
                const file = path.parse(relative_file);

                switch (file.ext) {
                    
                    case '.md': {
                        const md = await fs.promises.readFile(relative_file, 'utf8');
                        const md_parsed = await marked.parse(md);
                        result = await parse(md_parsed, options);
                    } break;
                    
                    // Does it even make sense to use this?
                    case '.html': {
                        result = await parse(relative_file, options);
                    } break;

                }
            }

            else {
                const content = match[2].trim();
                const [ variable, location ] = content.split(":", 2);
                
                if (location) {
                    
                    if (variable === '#') {
                        result = options[location][repeated[location].times];
                        repeated[location].times++;
                    }

                    else {

                        // Should I got to next one?
                        if (repeated[location].processed.includes(variable)) {
                            // Then I have already used that value, meaning I'm starting a new repeated block
                            repeated[location].times++;
                            repeated[location].processed = [];
                        }
                        
                        result = options[location][repeated[location].times][variable];
                        repeated[location].processed.push(variable);
                    }

                }
                else {
                    result = options[variable];
                }
            }

            lines[i] = lines[i].replace(match[0], result);
            
            // If a new match is found here, the loop will continue until every injection has been processed
            match = lines[i].match(regexp);
        }
    
    }

    // Put the lines back together and return as a string
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
        
        const get_first_unhandled_article = () => {
            // WARNING! the filter function has to be a `function () {}` and not an `() => {}` because F***g javascript.
            let article = $('article').filter(function (i, el) { return $(this).attr('handled') !== 'true'; }).first();
            return article.length > 0 ? article : undefined;
        }
        
        for (let article = get_first_unhandled_article(); article; article = get_first_unhandled_article()) {
        
            // mark the article as handled, so that it is not handled twice
            $(article).attr('handled', 'true');
        
            const relative_path = $(article).attr('id');
            if (fs.existsSync(relative_path)) {
            
                const extension = path.parse(relative_path).ext;

                const file_content = await fs.promises.readFile(relative_path, 'utf8');
                
                let result;

                switch (extension) {
                    
                    case ".md": {
                        const md = await marked.parse(file_content);
                        result = await parse(md);
                    } break;
                    
                    case ".json": {
                        const json = await JSON.parse(file_content);
                        result = await parse(json.template, json.config)
                    } break;
                }

                if (result) {

                    // Remove the original article tag fully and replace it with the processed content
                    const inner_elements = $(article).html();
                    $(article).children().remove()
                    $(result).appendTo(article);

                    // If the template contains any <section class='innermarker'/> tag, put back the old innter html where it is
                    const inner_marker = $('section[class=innermarker]').first();
                    if (inner_marker.length > 0) {
                        inner_marker.replaceWith(inner_elements);
                    }

                    modified = true;
                }
                
            }
        }

        const out_html = path.normalize(output_folder + html_file);

        if (modified) {
            // console.log('Processed page: ' + util.inspect(html_file));
            await fs.promises.writeFile(out_html, $.html());
        }
        else {
            // console.log('Copied page: ' + util.inspect(html_file));
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
