import { describe, expect, it } from "vitest";
import { matchNaturalAnswer, type Question } from "../index";

const salesVisibilityQuestion: Question = {
  id: "crm-sales-visibility",
  topic: "sales_visibility",
  category: "PRODUCT",
  text: "Apakah sales hanya melihat data brand sendiri sementara owner melihat semua?",
  contextReferences: ["rawIdea"],
  relatedRequirementIds: ["sales_visibility"],
  affects: ["permissions"],
  answerType: "SINGLE_CHOICE",
  options: [
    {
      id: "owner_all_sales_brand_scoped",
      label: "Sales per brand, owner lihat semua",
      description: "Batas akses mengikuti brand.",
    },
    {
      id: "all_sales_cross_brand",
      label: "Semua sales boleh lihat semua",
      description: "Kolaborasi lintas brand dengan batas ownership longgar.",
    },
    {
      id: "visibility_undecided",
      label: "Belum yakin",
      description: "Aturan akses tetap terbuka.",
    },
  ],
  priority: 10,
  reasonAsked: "Menentukan batas akses.",
};

const jobIdentityQuestion: Question = {
  id: "job-product-identity",
  topic: "product_identity",
  category: "PRODUCT",
  text: "Siapa yang dapat menggunakan platform mencari kerja ini?",
  contextReferences: ["rawIdea"],
  relatedRequirementIds: ["product_identity"],
  affects: ["actors"],
  answerType: "SINGLE_CHOICE",
  options: [
    {
      id: "job_seeker_only",
      label: "Pencari kerja saja",
      description: "User mencari, menyimpan, dan melacak lowongan.",
    },
    {
      id: "two_sided_marketplace",
      label: "Pencari kerja + perusahaan",
      description: "Perusahaan dapat memasang lowongan dan mengelola kandidat.",
    },
  ],
  priority: 10,
  reasonAsked: "Menentukan actor produk.",
};

describe("matchNaturalAnswer", () => {
  it("maps normalized Indonesian morphology and punctuation to one CRM option", () => {
    expect(
      matchNaturalAnswer(
        "Sales per brand, owner melihat semuanya.",
        salesVisibilityQuestion,
      ),
    ).toBe("owner_all_sales_brand_scoped");
    expect(
      matchNaturalAnswer(
        "SALES per brand — OWNER LIHAT semua!",
        salesVisibilityQuestion,
      ),
    ).toBe("owner_all_sales_brand_scoped");
  });

  it("maps an unambiguous job marketplace reply", () => {
    expect(
      matchNaturalAnswer(
        "perusahaan juga boleh pasang lowongan",
        jobIdentityQuestion,
      ),
    ).toBe("two_sided_marketplace");
  });

  it("does not guess from new context or weak shared overlap", () => {
    expect(
      matchNaturalAnswer(
        "user juga perlu punya beberapa recruiter per akun",
        salesVisibilityQuestion,
      ),
    ).toBeNull();
    expect(
      matchNaturalAnswer("sales brand", salesVisibilityQuestion),
    ).toBeNull();
    expect(
      matchNaturalAnswer(
        "belum yakin, cari dulu contoh kompetitor",
        salesVisibilityQuestion,
      ),
    ).toBeNull();
  });
});
