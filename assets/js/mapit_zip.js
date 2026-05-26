(function(){
  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function dosTime(date) {
    return ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((date.getSeconds() / 2) & 31);
  }

  function dosDate(date) {
    return (((date.getFullYear() - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);
  }

  function u16(n) { return [n & 255, (n >>> 8) & 255]; }
  function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }

  function encode(content) {
    if (content instanceof Uint8Array) return content;
    return new TextEncoder().encode(String(content));
  }

  function create(files) {
    const now = new Date();
    const chunks = [];
    const central = [];
    let offset = 0;

    files.forEach(file => {
      const nameBytes = new TextEncoder().encode(file.name.replace(/\\/g, '/'));
      const data = encode(file.content);
      const crc = crc32(data);
      const local = new Uint8Array([
        ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0),
        ...u16(dosTime(now)), ...u16(dosDate(now)), ...u32(crc),
        ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0)
      ]);
      chunks.push(local, nameBytes, data);

      const cent = new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0),
        ...u16(dosTime(now)), ...u16(dosDate(now)), ...u32(crc),
        ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0), ...u32(offset)
      ]);
      central.push(cent, nameBytes);
      offset += local.length + nameBytes.length + data.length;
    });

    const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
    const end = new Uint8Array([
      ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
      ...u32(centralSize), ...u32(offset), ...u16(0)
    ]);
    return new Blob([...chunks, ...central, end], { type: 'application/zip' });
  }

  window.MAPitZip = { create };
})();
