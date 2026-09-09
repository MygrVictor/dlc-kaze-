/**
 * Tests — Middleware de sécurité
 * validatePassword, isValidEmail, sanitizeInputs
 */
const {
  validatePassword,
  isValidEmail,
  isValidMobile,
  isValidPhone,
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

describe("isValidPhone", () => {
  test("accepte un fixe français", () => {
    // Le contact d'une concession ou d'un garage est le plus souvent un
    // fixe : le refuser obligerait à saisir un numéro faux pour passer.
    expect(isValidPhone("0240824231")).toBe(true);
  });

  test("accepte un mobile français", () => {
    expect(isValidPhone("0612345678")).toBe(true);
  });

  test("accepte les séparateurs usuels", () => {
    expect(isValidPhone("02 40 82 42 31")).toBe(true);
    expect(isValidPhone("02.40.82.42.31")).toBe(true);
    expect(isValidPhone("02-40-82-42-31")).toBe(true);
  });

  test("accepte les formes internationales", () => {
    expect(isValidPhone("+33 6 69 58 34 30")).toBe(true);
    expect(isValidPhone("0033612345678")).toBe(true);
  });

  test("rejette un numéro de service payant (08)", () => {
    // On n'y joint personne : ce n'est pas un contact exploitable.
    expect(isValidPhone("0899123456")).toBe(false);
  });

  test("rejette une suite trop courte", () => {
    expect(isValidPhone("123")).toBe(false);
  });

  test("rejette une valeur non-string", () => {
    expect(isValidPhone(null)).toBe(false);
    expect(isValidPhone(42)).toBe(false);
  });
});

describe("isValidMobile", () => {
  test("accepte 06 et 07", () => {
    expect(isValidMobile("0612345678")).toBe(true);
    expect(isValidMobile("0712345678")).toBe(true);
  });

  test("rejette un fixe : WhatsApp exige un mobile", () => {
    expect(isValidMobile("0240824231")).toBe(false);
  });
});

// Le préfixe « 00 » désigne un indicatif de sortie international. Il était
// retiré avant tout autre contrôle, si bien qu'un numéro national
// commençant par deux zéros était amputé de ses deux premiers chiffres,
// puis admis au seul motif de sa longueur. « 0000000000 » passait ainsi
// pour un mobile valide sur les formulaires d'inscription.
describe("numéros de contournement", () => {
  test.each(["0000000000", "1111111111", "0000000000000"])(
    "%s n'est ni un téléphone ni un mobile",
    (valeur) => {
      expect(isValidPhone(valeur)).toBe(false);
      expect(isValidMobile(valeur)).toBe(false);
    },
  );
});
