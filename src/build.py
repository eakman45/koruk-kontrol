import base64
s=open('src/app.html').read()
nm='node_modules/'
s=s.replace('/*PDFJS*/',open(nm+'pdfjs-dist/legacy/build/pdf.min.js').read(),1)
s=s.replace('/*PDFWORKER*/',open(nm+'pdfjs-dist/legacy/build/pdf.worker.min.js').read(),1)
s=s.replace('/*ZXING*/',open(nm+'zxing-wasm/dist/iife/reader/index.js').read(),1)
s=s.replace('/*WASMB64*/',base64.b64encode(open(nm+'zxing-wasm/dist/reader/zxing_reader.wasm','rb').read()).decode(),1)
open('index.html','w').write(s); print(len(s)/1e6,'MB')
