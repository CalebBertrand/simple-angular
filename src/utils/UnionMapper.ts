/**
    * Maps a union of types to a new union of types.
    * @param TUnion - The union
    * @param DiscriminatingKey - A key which is required to be common across all the subtypes in the union, and unique among them   
    * @param TMapper - A mapper, which defines optional key mappings for any specified sub-types
    *
    * Example use:
    * type IrNode = MapUnion<
    *   ParseNode,
    *   'type',
    *   {
    *       [ParseNodeType.Text]: {
    *           type: IrNodeType.Text;
    *           body: string;
    *   };
    *   [ParseNodeType.Element]: {
            * type: IrNodeType.Element;
            * body: Array<IrNode>;
    *   };
    * }
    *
    * This results in a type with the same items, but those specific keys for the subtypes are mapped and any other unspecified keys 
    *  are copied from the original union types.
>;*/
export type MapUnion<
  T,
  K extends keyof T,
  Overrides extends Record<PropertyKey, object>
> = T extends infer U
  ? U extends Record<K, keyof Overrides>
    ? Omit<U, keyof Overrides[U[K]]> & Overrides[U[K]]
    : U
  : never;

