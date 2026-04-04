from scripts.build.directory_manager import DirectoryManager

def build(base_dir):
    config_dir = base_dir / 'config'
    build_config_dir = base_dir / 'build-config'
    frontend_dir = base_dir / 'frontend'
    backend_dir = base_dir / 'backend'
    dist_dir = base_dir / 'dist'

    builder = DirectoryManager()

    # check if config files exists
    builder.check_exists(config_dir)
    builder.check_exists(build_config_dir)

    # clean old distributions
    builder.delete(dist_dir)

    # copy frontend build essential files
    builder.copy(build_config_dir / 'logo.svg', frontend_dir / 'public' / 'logo.svg')

    # build frontend
    builder.run(frontend_dir, 'pnpm vite build')
    builder.move(frontend_dir / 'dist', dist_dir / 'frontend')

    # build backend
    builder.run(backend_dir, 'pnpm prisma generate')
    builder.run(backend_dir, 'node ./scripts/bundle.mjs')
    builder.move(backend_dir / 'dist', dist_dir / 'backend')
    builder.copy(backend_dir / 'prisma', dist_dir / 'prisma')
    builder.copy(backend_dir / 'scripts' / 'package.json', dist_dir / 'package.json')
    builder.copy(backend_dir / 'scripts' / 'pnpm-workspace.yaml', dist_dir / 'pnpm-workspace.yaml')