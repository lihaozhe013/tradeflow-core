import html
import json
import re

from scripts.build.directory_manager import DirectoryManager


def apply_app_title(index_html, manifest_path):
    """Rewrite the home screen label of the built entry document.

    iOS displays apple-mobile-web-app-title under the home screen icon, so a
    deployment that ships its own manifest should also control that label.
    """
    short_name = json.loads(manifest_path.read_text(encoding='utf-8')).get('short_name')
    if not short_name or not index_html.is_file():
        return

    document = index_html.read_text(encoding='utf-8')
    title = html.escape(short_name, quote=True)
    updated, replacements = re.subn(
        r'<meta name="apple-mobile-web-app-title" content="[^"]*"',
        f'<meta name="apple-mobile-web-app-title" content="{title}"',
        document
    )
    if replacements:
        index_html.write_text(updated, encoding='utf-8')


def build(base_dir):
    build_config_dir = base_dir / 'build-config'
    frontend_dir = base_dir / 'frontend'
    backend_dir = base_dir / 'backend'
    dist_dir = base_dir / 'dist'

    builder = DirectoryManager()

    # check if config files exists
    builder.check_exists(build_config_dir / 'frontendConfig.json')
    builder.check_exists(build_config_dir / 'logo.svg')

    # clean old distributions
    builder.delete(dist_dir)

    # copy frontend build essential files
    builder.copy(build_config_dir / 'logo.svg', frontend_dir / 'public' / 'logo.svg')

    # optional brand overrides; the committed defaults in frontend/public stay in place
    # when a deployment does not provide its own icons or manifest
    brand_icons = build_config_dir / 'icons'
    if brand_icons.is_dir():
        builder.copy(brand_icons, frontend_dir / 'public' / 'icons')

    brand_manifest = build_config_dir / 'manifest.webmanifest'
    if brand_manifest.is_file():
        builder.copy(brand_manifest, frontend_dir / 'public' / 'manifest.webmanifest')

    # build frontend
    builder.run(frontend_dir, 'bun run build')

    if brand_manifest.is_file():
        apply_app_title(frontend_dir / 'dist' / 'index.html', brand_manifest)

    builder.move(frontend_dir / 'dist', dist_dir / 'frontend')

    # build backend
    builder.delete(backend_dir / 'prisma' / 'client')
    builder.run(backend_dir, 'bun run prisma:generate')
    builder.run(backend_dir, 'bun run build')
    builder.move(backend_dir / 'dist', dist_dir / 'backend')
    builder.copy(backend_dir / 'prisma', dist_dir / 'backend' / 'prisma')
