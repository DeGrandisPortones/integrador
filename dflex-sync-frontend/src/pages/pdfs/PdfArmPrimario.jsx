function getPiernasAlturaMM(row) {
  return toMM(
    row.PIERNAS_Altura ??
      row.Piernas_Altura ??
      row.PIERNA_Altura ??
      row.Pierna_Altura ??
      row.PIERNAS_ALTURA ??
      row.piernas_altura
  );
}