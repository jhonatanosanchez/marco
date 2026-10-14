// Cámaras Frigate (fork fsrhome): el campo de zonas del admin se edita como texto y se separa al salir del campo.
export const parseZones = (text: string): string[] => text.split(',').map((z) => z.trim()).filter(Boolean);
