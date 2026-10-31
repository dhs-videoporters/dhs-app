#!/bin/sh
# Genera la página oficial (index.html en la raíz) a partir de la de pruebas: mismas pantallas, configuración oficial.
cd "$(dirname "$0")/.."
sed -e 's#\.\./#./#g' -e 's#config-pruebas\.js[^"]*#config-oficial.js?v=2#' -e 's#(pruebas)##g' -e 's#content="DHS Pruebas"#content="DHS App"#' pruebas/index.html > index.html
echo "index.html oficial generado"
