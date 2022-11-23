
// node.js imports
const fs = require('fs');
const util = require('util');
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


    // Process dependencies
    const dependencies = [
        `./node_modules/marked/marked.min.js`,
        `./index.html`,
        `./src/`,
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
    await fs.promises.mkdir(output_folder + "/markdown_content", { recursive: true });
    await map_recursive('./markdown_content', async (file) => {
        const file_name = path.parse(file).name;
        const target_file = path.normalize(output_folder + "/markdown_content/" + file_name + ".js");
        const md_content = await fs.promises.readFile(file, 'utf8');
        const escaped_md_data = escape(md_content);
        const content_entry = `const ${file_name} = \`${escaped_md_data}\``
        
        await fs.promises.writeFile(target_file, content_entry);
    });

}

build_project();