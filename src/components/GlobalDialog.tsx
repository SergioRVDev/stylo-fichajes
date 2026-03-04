export interface DialogConfig {
  isOpen: boolean;
  title: string;
  message: string;
  type: "alert" | "confirm";
  onConfirm?: () => void;
}

interface GlobalDialogProps {
  config: DialogConfig;
  onClose: () => void;
}

export function GlobalDialog({ config, onClose }: GlobalDialogProps) {
  if (!config.isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-border text-center">
        <h3 className="text-xl font-bold text-[#222b45] mb-2">{config.title}</h3>
        <p className="text-sm text-muted mb-6 whitespace-pre-line">{config.message}</p>
        <div className="flex gap-3 justify-center">
          {config.type === "confirm" && (
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-border bg-surface py-2.5 text-sm font-medium transition-colors hover:bg-muted/10 text-secondary"
            >
              Cancelar
            </button>
          )}
          <button
            onClick={() => {
              if (config.type === "confirm" && config.onConfirm) {
                config.onConfirm();
              }
              onClose();
            }}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition-all shadow-sm hover:shadow-md ${
              config.type === "confirm" ? "bg-red-500 hover:bg-red-600" : "bg-primary hover:bg-primary-dark"
            }`}
          >
            {config.type === "confirm" ? "Confirmar" : "Entendido"}
          </button>
        </div>
      </div>
    </div>
  );
}
