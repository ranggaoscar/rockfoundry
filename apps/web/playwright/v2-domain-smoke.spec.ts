import { expect, test } from "@playwright/test";

test("V2 domain smoke keeps first three turns contextual", async ({ request }) => {
  const domains = [
    {
      name: "Finance",
      turns: [
        "Gua mau bikin aplikasi sederhana buat catat uang masuk keluar.",
        "Buat usaha kecil. Kayak warung. Yang make owner sendiri.",
        "Jangan pakai approval, owner saja dulu.",
      ],
      terms: /uang|owner|transaksi|kas/i,
    },
    {
      name: "Pet care",
      turns: [
        "Gua mau bikin aplikasi buat tempat grooming dan penitipan anjing.",
        "Pemilik hewan booking grooming atau penitipan, staf perlu lihat jadwal.",
        "Satu booking boleh punya beberapa layanan.",
      ],
      terms: /jadwal|staf|booking|layanan/i,
    },
    {
      name: "Event",
      turns: [
        "Gua mau bikin sistem untuk ngatur vendor yang ikut festival.",
        "Panitia perlu tahu vendor mana yang sudah lengkap dan di mana booth-nya.",
        "Panitia yang mengubah status kelengkapan.",
      ],
      terms: /vendor|panitia|booth|kelengkapan/i,
    },
    {
      name: "CRM",
      turns: [
        "Gua mau CRM untuk lima brand marmer, tiap brand punya sales sendiri dan owner harus bisa lihat semuanya.",
        "Customer lintas brand perlu tetap punya histori yang jelas.",
        "Sales hanya boleh melihat brand sendiri, owner semua.",
      ],
      terms: /customer|brand|sales|owner/i,
    },
  ];

  const results = [];
  for (const domain of domains) {
    const created = await request.post("/api/projects", {
      data: { description: domain.turns[0] },
    });
    expect(created.status(), domain.name).toBe(201);
    const project = (await created.json()).project as { id: string };
    const replies: string[] = [];
    for (const text of domain.turns.slice(1)) {
      const response = await request.post(
        `/api/projects/${project.id}/conversation`,
        { data: { text } },
      );
      expect(response.status(), domain.name).toBe(200);
      const body = await response.json();
      expect(body.question, domain.name).toBeNull();
      expect(body.message, domain.name).toMatch(domain.terms);
      replies.push(body.message);
    }
    results.push({ domain: domain.name, replies });
  }

  expect(new Set(results.map((result) => result.replies.join(" "))).size).toBe(
    domains.length,
  );
});
