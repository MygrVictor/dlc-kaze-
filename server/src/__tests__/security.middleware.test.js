/**
 * Tests — Middleware de sécurité
 * validatePassword, isValidEmail, sanitizeInputs
 */
const {
  validatePassword,
  isValidEmail,
} = require("../middleware/security.middleware");

describe("validatePassword", () => {
  test("accepte un mot de passe fort", () => {
    expect(validatePassword("Secure#123")).toHaveLength(0);
  });

  test("rejette un mot de passe trop court", () => {
    const errors = validatePassword("Ab1!");
    expect(errors.some((e) => e.includes("8 caractères"))).toBe(true);
  });

  test("rejette un mot de passe sans majuscule", () => {
    const errors = validatePassword("secure#123");
    expect(errors.some((e) => e.includes("majuscule"))).toBe(true);
  });

  test("rejette un mot de passe sans minuscule", () => {
    const errors = validatePassword("SECURE#123");
    expect(errors.some((e) => e.includes("minuscule"))).toBe(true);
  });

  test("rejette un mot de passe sans chiffre", () => {
    const errors = validatePassword("Secure#abc");
    expect(errors.some((e) => e.includes("chiffre"))).toBe(true);
  });

  test("rejette un mot de passe sans caractère spécial", () => {
    const errors = validatePassword("Secure1234");
    expect(errors.some((e) => e.includes("spécial"))).toBe(true);
  });

  test("rejette un mot de passe trop long (>128)", () => {
    const errors = validatePassword("A1!" + "a".repeat(130));
    expect(errors.some((e) => e.includes("128"))).toBe(true);
  });
});

describe("isValidEmail", () => {
  test("accepte une adresse valide", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });

  test("accepte un sous-domaine", () => {
    expect(isValidEmail("user@mail.example.co.uk")).toBe(true);
  });

  test("rejette une adresse sans @", () => {
    expect(isValidEmail("notanemail")).toBe(false);
  });

  test("rejette une adresse trop longue (>254)", () => {
    expect(isValidEmail("a".repeat(250) + "@b.com")).toBe(false);
  });

  test("rejette une valeur non-string", () => {
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(42)).toBe(false);
  });
});
