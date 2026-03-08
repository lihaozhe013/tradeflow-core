from scripts.build.directory_manager import DirectoryManager

def build(base_dir):
    data_dir = base_dir / 'data'
    frontend_dir = base_dir / 'frontend'
    backend_dir = base_dir / 'backend'
    dist_dir = base_dir / 'dist'

    builder = DirectoryManager()

    # check if config files exists
    builder.check_exists(data_dir)

    # clean old distributions
    builder.delete(dist_dir)

    # copy frontend build essential files
    builder.copy(data_dir / 'frontendConfig.json', frontend_dir / 'src' / 'config' / 'frontendConfig.json')
    builder.copy(data_dir / 'logo.svg', frontend_dir / 'public' / 'logo.svg')

    # build frontend
    builder.run(frontend_dir, 'npx tsc && npx vite build')
    builder.move(frontend_dir / 'dist', dist_dir / 'frontend')

    # build backend
    builder.run(backend_dir, 'npx prisma generate')
    builder.run(backend_dir, 'node ./scripts/bundle.mjs')
    builder.move(backend_dir / 'dist', dist_dir / 'backend')
    builder.copy(backend_dir / 'prisma', dist_dir / 'prisma')
    builder.copy(backend_dir / 'scripts' / 'package.json', dist_dir / 'package.json')
    builder.copy(backend_dir / 'node_modules' / '.prisma/', dist_dir /'node_modules' / '.prisma/')