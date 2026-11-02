/* Widget Livr'Auto — script autonome, sans dépendance.
 *
 * Paramètres d'URL (même format que les autres widgets transport
 * d'Interenchères) :
 *   partnerName, externalId,
 *   fromStreet, fromPostcode, fromCity, fromCountryAlpha2,
 *   fromLat, fromLng, fromName,
 *   context=adjudication   (facultatif : affiche « Enchère remportée »)
 *
 * Messages envoyés à la page parente (window.parent.postMessage) :
 *   { type: "livrauto:resize", height }
 *   { type: "livrauto:order",  missionId, externalId }
 *   { type: "livrauto:close" }
 */
(function () {
  "use strict";

  var API = "/api/widget";
  var BAN = "https://api-adresse.data.gouv.fr/search/";

  // ── Paramètres du lot ─────────────────────────────────────
  var qs = new URLSearchParams(window.location.search);
  var lot = {
    partner: qs.get("partnerName") || "",
    externalId: qs.get("externalId") || "",
    street: qs.get("fromStreet") || "",
    postcode: qs.get("fromPostcode") || "",
    city: qs.get("fromCity") || "",
    country: qs.get("fromCountryAlpha2") || "FR",
    lat: qs.get("fromLat"),
    lng: qs.get("fromLng"),
    name: qs.get("fromName") || "",
    phone: qs.get("fromPhone") || "",
    email: qs.get("fromEmail") || "",
    insuranceValue: qs.get("insuranceValue") || "",
    adjudication: qs.get("context") === "adjudication",
  };

  var state = {
    quote: null, // { quote_id, distance_km, price_ttc }
    destination: "",
    client: null,
    cgvSignedAt: null,
  };

  // ── Utilitaires ───────────────────────────────────────────
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function bind(name, value) {
    $all('[data-bind="' + name + '"]').forEach(function (el) {
      el.textContent = value;
    });
  }

  function euros(n) {
    return Math.round(Number(n)).toLocaleString("fr-FR") + " €";
  }

  function showError(step, message) {
    var el = $('[data-error="' + step + '"]');
    if (!el) return;
    el.textContent = message || "";
    el.hidden = !message;
    notifyHeight();
  }

  function busy(btn, on) {
    btn.disabled = on;
    btn.setAttribute("aria-busy", on ? "true" : "false");
  }

  function post(path, body) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () {
      ctrl.abort();
    }, 15000);
    return fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (!res.ok)
              throw new Error(
                data.error || "Service momentanément indisponible.",
              );
            return data;
          });
      })
      .catch(function (err) {
        if (err.name === "AbortError" || err instanceof TypeError) {
          throw new Error(
            "Service momentanément indisponible. Réessayez dans un instant.",
          );
        }
        throw err;
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }

  function goTo(step) {
    $all("[data-step]").forEach(function (s) {
      s.hidden = s.getAttribute("data-step") !== step;
    });
    window.scrollTo(0, 0);
    notifyHeight();
  }

  // ── Communication avec la page parente ────────────────────
  function toParent(msg) {
    if (window.parent && window.parent !== window)
      window.parent.postMessage(msg, "*");
  }
  var lastHeight = 0;
  function notifyHeight() {
    var h = Math.ceil(document.documentElement.scrollHeight);
    if (h !== lastHeight) {
      lastHeight = h;
      toParent({ type: "livrauto:resize", height: h });
    }
  }
  if ("ResizeObserver" in window)
    new ResizeObserver(notifyHeight).observe(document.body);
  window.addEventListener("load", notifyHeight);

  // ── Affichage du départ ───────────────────────────────────
  var adresseLot = [
    lot.street,
    [lot.postcode, lot.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  var departTexte = lot.name
    ? lot.name +
      (lot.city
        ? " — " +
          lot.city +
          (lot.postcode ? " (" + lot.postcode.slice(0, 2) + ")" : "")
        : "")
    : adresseLot;

  if (!adresseLot || !lot.partner) {
    // Widget mal paramétré : on n'affiche rien plutôt qu'un formulaire cassé.
    document.body.innerHTML = "";
    toParent({ type: "livrauto:resize", height: 0 });
    return;
  }

  bind("depart", departTexte);
  bind("departLabel", "(point d'enlèvement)");
  bind("partnerName", lot.partner.replace(/^interencheres$/i, "Interenchères"));
  bind(
    "recapEyebrow",
    lot.adjudication ? "🏆 Enchère remportée" : "Devis définitif",
  );

  // ── Autocomplétion d'adresse (Base Adresse Nationale) ─────
  function autocomplete(input, list) {
    var timer = null;
    var items = [];
    var index = -1;

    function close() {
      list.hidden = true;
      list.innerHTML = "";
      index = -1;
      notifyHeight();
    }
    function select(i) {
      if (!items[i]) return;
      input.value = items[i];
      close();
    }
    function highlight(i) {
      index = i;
      $all("li", list).forEach(function (li, k) {
        li.setAttribute("aria-selected", k === i ? "true" : "false");
      });
    }

    input.addEventListener("input", function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 4) return close();
      timer = setTimeout(function () {
        fetch(BAN + "?limit=5&autocomplete=1&q=" + encodeURIComponent(q))
          .then(function (r) {
            return r.json();
          })
          .then(function (data) {
            items = (data.features || []).map(function (f) {
              return f.properties.label;
            });
            if (!items.length || document.activeElement !== input)
              return close();
            list.innerHTML = "";
            items.forEach(function (label, i) {
              var li = document.createElement("li");
              li.setAttribute("role", "option");
              li.textContent = label;
              li.addEventListener("mousedown", function (e) {
                e.preventDefault();
                select(i);
              });
              list.appendChild(li);
            });
            list.hidden = false;
            index = -1;
            notifyHeight();
          })
          .catch(close); // BAN indisponible : la saisie libre reste possible.
      }, 250);
    });
    input.addEventListener("keydown", function (e) {
      if (list.hidden) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        highlight(Math.min(index + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        highlight(Math.max(index - 1, 0));
      } else if (e.key === "Enter" && index >= 0) {
        e.preventDefault();
        select(index);
      } else if (e.key === "Escape") close();
    });
    input.addEventListener("blur", function () {
      setTimeout(close, 100);
    });
  }
  autocomplete($("#dest"), $("#dest-suggestions"));

  // ── Étape 1 : estimation ──────────────────────────────────
  function estimer(destination) {
    return post("/estimation", {
      partner: lot.partner,
      external_id: lot.externalId,
      depart: {
        street: lot.street,
        postcode: lot.postcode,
        city: lot.city,
        country: lot.country,
        lat: lot.lat,
        lng: lot.lng,
        name: lot.name,
        phone: lot.phone,
        email: lot.email,
        insurance_value: lot.insuranceValue,
      },
      adresse_arrivee: destination,
    }).then(function (q) {
      state.quote = q;
      state.destination = destination;
      bind("distance", q.distance_km + " km");
      bind("price", euros(q.price_ttc));
      bind("destination", destination);
      return q;
    });
  }

  $("#form-estimation").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = $("#dest");
    var btn = $('button[type="submit"]', e.target);
    var destination = input.value.trim();
    showError("estimation", "");
    if (destination.length < 5) {
      input.setAttribute("aria-invalid", "true");
      return showError(
        "estimation",
        "Indiquez une adresse de livraison complète.",
      );
    }
    input.removeAttribute("aria-invalid");
    busy(btn, true);
    btn.textContent = "Calcul en cours…";
    estimer(destination)
      .then(function () {
        $('[data-bind="result"]').hidden = false;
        $("#go-coordonnees").hidden = false;
        notifyHeight();
      })
      .catch(function (err) {
        $('[data-bind="result"]').hidden = true;
        $("#go-coordonnees").hidden = true;
        showError("estimation", err.message);
      })
      .finally(function () {
        busy(btn, false);
        btn.textContent = "Estimer le coût";
      });
  });

  $("#dest").addEventListener("input", function () {
    // L'adresse a changé : l'ancien prix ne correspond plus.
    if (state.quote && this.value.trim() !== state.destination) {
      $('[data-bind="result"]').hidden = true;
      $("#go-coordonnees").hidden = true;
      notifyHeight();
    }
  });

  $("#go-coordonnees").addEventListener("click", function () {
    $("#dest2").value = state.destination;
    goTo("coordonnees");
  });

  $all("[data-back]").forEach(function (b) {
    b.addEventListener("click", function () {
      goTo(b.getAttribute("data-back"));
    });
  });

  // ── Étape 2 : coordonnées ─────────────────────────────────
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var TEL_RE = /^\+?[0-9 .()-]{9,20}$/;

  $("#form-coordonnees").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.target;
    var btn = $('button[type="submit"]', form);
    var champs = {
      prenom: form.prenom.value.trim(),
      nom: form.nom.value.trim(),
      tel: form.tel.value.trim(),
      email: form.email.value.trim(),
      destination: form.destination.value.trim(),
    };
    var invalides = [];
    if (!champs.prenom) invalides.push("prenom");
    if (!champs.nom) invalides.push("nom");
    if (!TEL_RE.test(champs.tel)) invalides.push("tel");
    if (!EMAIL_RE.test(champs.email)) invalides.push("email");
    if (champs.destination.length < 5) invalides.push("destination");

    $all(".lw-input", form).forEach(function (i) {
      i.setAttribute(
        "aria-invalid",
        invalides.indexOf(i.name) >= 0 ? "true" : "false",
      );
    });
    if (invalides.length) {
      return showError(
        "coordonnees",
        "Merci de compléter correctement les champs en rouge.",
      );
    }
    showError("coordonnees", "");

    state.client = {
      first_name: champs.prenom,
      last_name: champs.nom,
      phone: champs.tel,
      email: champs.email,
    };
    bind("prenom", champs.prenom);
    bind("fullName", champs.prenom + " " + champs.nom);
    bind("contact", champs.tel + " · " + champs.email);

    // Adresse modifiée depuis l'estimation : nouveau devis.
    var suite =
      champs.destination === state.destination
        ? Promise.resolve()
        : estimer(champs.destination);

    busy(btn, true);
    suite
      .then(function () {
        goTo("recap");
      })
      .catch(function (err) {
        showError("coordonnees", err.message);
      })
      .finally(function () {
        busy(btn, false);
      });
  });

  // ── Étape 3 : CGV et confirmation ─────────────────────────
  $("#cgv-open").addEventListener("click", function () {
    var body = $("#cgv-body");
    body.hidden = !body.hidden;
    notifyHeight();
  });
  $("#cgv-accept").addEventListener("change", function () {
    $("#cgv-sign").disabled = !this.checked;
  });
  $("#cgv-sign").addEventListener("click", function () {
    state.cgvSignedAt = new Date();
    var heure = state.cgvSignedAt.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    $("#cgv").classList.add("lw-cgv--signed");
    $("#cgv-body").hidden = true;
    $("#cgv-open").hidden = true;
    bind("cgvIco", "✓");
    bind("cgvTitle", "CGV acceptées");
    bind("cgvSub", "Aujourd'hui à " + heure);
    bind("confirmHint", "Aucun prélèvement n'est effectué à cette étape.");
    $("#confirmer").disabled = false;
    notifyHeight();
  });

  $("#confirmer").addEventListener("click", function () {
    var btn = this;
    if (!state.cgvSignedAt || !state.quote) return;
    showError("recap", "");
    busy(btn, true);
    post("/commande", {
      partner: lot.partner,
      external_id: lot.externalId,
      quote_id: state.quote.quote_id,
      client: state.client,
      cgv_acceptees: true,
    })
      .then(function (res) {
        bind("reference", "LA-" + res.mission_id);
        bind(
          "montantLabel",
          res.paiement === "paye" ? "Montant réglé" : "Montant à régler",
        );
        goTo("confirmation");
        toParent({
          type: "livrauto:order",
          missionId: res.mission_id,
          externalId: lot.externalId,
        });
      })
      .catch(function (err) {
        showError("recap", err.message);
        busy(btn, false);
      });
  });

  // ── Étape 4 ───────────────────────────────────────────────
  $("#retour-partenaire").addEventListener("click", function () {
    toParent({ type: "livrauto:close" });
  });
})();
