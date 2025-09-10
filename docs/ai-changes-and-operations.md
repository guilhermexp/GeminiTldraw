# Guia de Integrações de Imagem/Vídeo e Histórico de Mudanças

## Visão Geral (o que foi feito)
- Máscara integrada ao Assistant e ao Create: abrir editor de máscara com prompt do chat; opção “Edit” também no modo assistant.
- Overlay (composição) de duas formas:
  - Compose (AI): base + overlay com máscara e prompt; IA faz a fusão (Gemini, com fallback FAL).
  - Bake Overlay: mescla determinística (sem IA) o overlay na base, preservando pixels/cores.
- Fallback FAL.ai habilitado para todos os fluxos:
  - Texto→Imagem → fal-ai/flux/schnell.
  - Imagem→Imagem → fal-ai/flux/dev/image-to-image.
  - Inpainting (máscara) → fal-ai/flux-general/inpainting.
  - Vídeo → fal-ai/veo3.
- Vídeo: atualizado o modelo padrão para Veo 3 (`veo-3.0-generate-001`).
- Editor de máscara: removido blur do modal, fixado tamanho do container, canvas/imagem 100% (melhor visibilidade e precisão).

## Variáveis de Ambiente
- `GEMINI_API_KEY`: chave Gemini (injetada como `process.env.API_KEY`).
- `FAL_KEY`: chave FAL.ai no formato `KEY_ID:KEY_SECRET` (injetada como `process.env.FAL_KEY`).
- Onde definir: `.env.local` (git-ignorado). Vite mapeia em tempo de build (veja `vite.config.ts`).

## Fluxos e Fallbacks
- Texto→Imagem
  - Primeiro tenta: Imagen 4 (`imagen-4.0-generate-001`).
  - Fallback: FAL `fal-ai/flux/schnell`. Conversão de URLs para data URLs é feita automaticamente.
- Imagem→Imagem (variações sem máscara)
  - Primeiro tenta: Gemini Image (`gemini-2.5-flash-image-preview`).
  - Fallback: FAL `fal-ai/flux/dev/image-to-image`.
- Edição com Máscara (mask)
  - Primeiro tenta: Gemini (imagem + máscara [+ overlay opcional]) com `responseModalities=[IMAGE,TEXT]`.
  - Fallback: FAL `fal-ai/flux-general/inpainting` (observação: o overlay pode não ser respeitado no fallback; use Bake Overlay para fidelidade).
- Vídeo
  - Primeiro tenta: Veo 3 (`veo-3.0-generate-001`) com polling até `done`.
  - Fallback: FAL `fal-ai/veo3` (URLs convertidas para base64 antes de inserir na tela).

## Uso na Interface
- Create (toolbar contextual)
  - 1 imagem selecionada: “Edit” abre o editor de máscara.
  - 2 imagens selecionadas: “Compose (AI)” abre editor com base + overlay; “Bake Overlay” mescla overlay sem IA.
- Assistant (chat)
  - “Use in Chat” define uma imagem de referência (ex.: overlay). Ao pedir edição numa outra imagem (base), o editor de máscara abre com o prompt preenchido e overlay carregado.
  - Dica: use prompts curtos e específicos para a área pintada.

## Modelos Utilizados
- Gemini: `gemini-2.5-flash`, `gemini-2.5-flash-image-preview`.
- Imagen 4: `imagen-4.0-generate-001`.
- Veo 3: `veo-3.0-generate-001` (padrão), com fallback FAL `fal-ai/veo3`.
- FAL imagem: `fal-ai/flux/schnell`, `fal-ai/flux/dev/image-to-image`, `fal-ai/flux-general/inpainting`.

## Arquivos Alterados (principais)
- `index.tsx`
  - Atualização do modelo de vídeo para Veo 3 e polling.
  - Fallbacks FAL: `falTextToImages`, `falImageToImages`, `falInpaint`, `falVeo3Video`.
  - Integração de máscara no assistant (abre editor com `initialPrompt` e `overlaySrc`).
  - Ações “Compose (AI)” e “Bake Overlay” na toolbar contextual (2 imagens).
  - Função `bakeOverlayBetweenShapes` (composição determinística sem IA).
- `Components/ImageEditor.tsx`
  - Suporte a `initialPrompt`, `overlaySrc`, toggle “Use overlay”.
  - Envio de imagem + máscara (+ overlay opcional) ao backend.
- `index.css`
  - Remoção de blur no overlay, ajustes de tamanho/visibilidade do editor.
- `vite.config.ts`
  - Injeção de `process.env.FAL_KEY`.
- `package.json`
  - Dependência `@fal-ai/client` adicionada.

## Limitações e Observações
- Fallback FAL para inpainting pode ignorar overlay. Para usar um recorte exato de outra imagem, prefira “Bake Overlay” (determinístico) ou “Compose (AI)” quando disponível.
- Em produção, chaves expostas no cliente são acessíveis. Ideal: via proxy/backend.
- Veo 3 pode exigir habilitações específicas no projeto GCP dependendo do conteúdo (pessoas/crianças).

## Testes e Validação
- Tipagem: `npx tsc --noEmit` sem erros.
- Build: Vite compila; avisos de algumas libs UI são esperados.
- Manual: verificar visual do editor de máscara e os três fluxos (Create/Assistant/Bake) com uma imagem de base e outra de overlay.

## Próximos Passos (sugeridos)
- Expor na UI seleção de provedor (Google/FAL) por fluxo e logging de fallback acionado.
- Opção “mostrar/ocultar máscara” no editor.
- Cache leve das últimas imagens geradas (melhor UX).
