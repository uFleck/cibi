-- Categories become rows the user can rename, describe and delete. The built-ins are seeded with their ids and default descriptions (see DEFAULT_CATEGORIES).
--> statement-breakpoint
CREATE TABLE Category (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  position    INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO Category (id, label, description, position) VALUES
  ('mercado', 'Mercado', 'Supermercados, hortifruti, padarias e compras de casa para comer', 1),
  ('restaurantes', 'Restaurantes e delivery', 'Restaurantes, lanchonetes, pedidos por aplicativo de entrega', 2),
  ('transporte', 'Transporte', 'Aplicativos de corrida, combustível, estacionamento, pedágio e transporte público', 3),
  ('moradia', 'Moradia', 'Aluguel, condomínio, IPTU e manutenção da casa', 4),
  ('contas', 'Contas e serviços', 'Energia, água, gás, internet, telefone e outros serviços recorrentes', 5),
  ('saude', 'Saúde', 'Farmácia, consultas, exames, plano de saúde e academia', 6),
  ('lazer', 'Lazer', 'Cinema, shows, jogos, eventos e passeios', 7),
  ('assinaturas', 'Assinaturas', 'Serviços de streaming e assinaturas digitais mensais ou anuais', 8),
  ('compras', 'Compras', 'Compras online e em lojas de varejo, roupas, eletrônicos e itens gerais', 9),
  ('educacao', 'Educação', 'Escola, faculdade, cursos, livros e mensalidades de ensino', 10),
  ('viagem', 'Viagem', 'Passagens, hotéis, hospedagem e gastos de viagem', 11),
  ('impostos', 'Impostos e taxas', 'Impostos, taxas governamentais, IPVA, DARF e DAS', 12),
  ('presentes', 'Presentes e doações', 'Presentes para outras pessoas, doações e contribuições religiosas', 13),
  ('outros', 'Outros', 'Qualquer gasto que não se encaixe nas outras categorias', 14);
