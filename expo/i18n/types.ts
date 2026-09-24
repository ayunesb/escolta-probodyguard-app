// Una traduccion debe tener exactamente las mismas claves que el ingles
// (fuente de verdad); si falta o sobra una, TypeScript lo marca.
export type Translation<T> = {
  [K in keyof T]: T[K] extends string ? string : Translation<T[K]>;
};
