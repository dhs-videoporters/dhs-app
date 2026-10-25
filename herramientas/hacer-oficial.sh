#!/bin/sh
# Genera la página oficial (index.html en la raíz) a partir de la de pruebas: mismas pantallas, configuración oficial.
cd "$(dirname "$0")/.."
sed -e 's#\.\./#./#g' -e 's#config-pruebas\.js[^"]*#config-oficial.js?v=1#' -e 's#(pruebas)##g' pruebas/index.html > index.html
echo "index.html oficial generado"
