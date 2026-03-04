"use client";

import { useEffect, useState } from "react";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { signOut } from "@/lib/firebase/auth";
import { uploadProfileImage } from "@/lib/firebase/storage";
import { updateProfile } from "firebase/auth";
import { ChevronLeft, LogOut, Edit2, ChevronDown, Loader2 } from "lucide-react";
import { DialogConfig, GlobalDialog } from "@/components/GlobalDialog";

export default function PerfilPage() {
  const router = useRouter();
  const { user, role, displayName, lastName, loading } = useAuth();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dialog State
  const [dialogConfig, setDialogConfig] = useState<DialogConfig>({
    isOpen: false,
    title: "",
    message: "",
    type: "alert"
  });

  const closeDialog = () => setDialogConfig(prev => ({ ...prev, isOpen: false }));

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <main className="flex min-h-dvh items-center justify-center pb-20">
        <p className="text-white">Cargando...</p>
      </main>
    );
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setDialogConfig({
        isOpen: true,
        title: "Archivo muy grande",
        message: "La imagen es demasiado grande. El límite es 5MB.",
        type: "alert"
      });
      return;
    }

    setUploading(true);
    try {
      const url = await uploadProfileImage(user.uid, file);
      await updateProfile(user, { photoURL: url });
      // Force reload to reflect new image
      window.location.reload();
    } catch (err) {
      console.error(err);
      setDialogConfig({
        isOpen: true,
        title: "Error",
        message: "Error al subir la imagen",
        type: "alert"
      });
      setUploading(false);
    }
  }

  const fullName = [displayName, lastName].filter(Boolean).join(" ");

  return (
    <main className="flex flex-col flex-1 w-full relative">
      {/* Dark Header Area */}
      <div className="flex h-[180px] items-start pt-6 px-4 relative justify-between text-white shrink-0">
        <button 
          onClick={() => router.back()}
          className="w-[42px] h-[42px] bg-white text-primary rounded-[14px] flex items-center justify-center shadow-sm"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button 
          onClick={handleSignOut}
          className="w-[42px] h-[42px] bg-white text-[#ef4444] rounded-[14px] flex items-center justify-center shadow-sm"
        >
          <LogOut className="w-5 h-5 ml-0.5" />
        </button>
      </div>

      {/* Main White Card Context */}
      <div className="flex-1 bg-surface rounded-t-[36px] px-5 pb-6 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.3)] w-full flex flex-col items-center relative mt-[-60px]">
        
        {/* Profile Avatar overlapping */}
        <div className="relative -mt-[70px] mb-4 flex flex-col items-center">
          <div className="w-[140px] h-[140px] relative drop-shadow-[0_10px_20px_rgba(0,0,0,0.15)]">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <defs>
                <clipPath id="hexClip">
                  <path d="M50 0 L93.3 25 L93.3 75 L50 100 L6.7 75 L6.7 25 Z" />
                </clipPath>
              </defs>
              <rect width="100" height="100" fill="#eef0f3" clipPath="url(#hexClip)" />
              {user.photoURL && (
                <image href={user.photoURL} width="100" height="100" preserveAspectRatio="xMidYMid slice" clipPath="url(#hexClip)" />
              )}
            </svg>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={handleImageUpload}
              disabled={uploading}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-2 right-1/2 translate-x-1/2 w-8 h-8 rounded-full bg-white shadow-md border border-border flex items-center justify-center text-primary hover:bg-surface transition-colors disabled:opacity-50"
            >
               {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit2 className="w-4 h-4 ml-0.5" />}
            </button>
          </div>
        </div>

        <h2 className="text-[22px] font-extrabold text-[#222b45] tracking-wide text-center uppercase">
          {fullName || "Usuario"}
        </h2>
        <p className="text-[#8f9bb3] mb-8 text-center text-[13px]">{user.email}</p>

        <div className="w-full bg-white rounded-[24px] border border-[#edf1f7] shadow-sm p-5 space-y-4">
           <h3 className="text-xl font-bold text-[#8f9bb3] text-center mb-4">Datos laborales</h3>
           
           <div className="flex justify-between items-center py-3 border-b border-dashed border-[#edf1f7]">
             <span className="font-bold text-[#222b45] text-[15px]">Empresa</span>
             <span className="text-[#222b45] text-[15px]">Suma Belleza C.B.</span>
           </div>
          
           <div className="flex justify-between items-center py-3 border-b border-dashed border-[#edf1f7]">
             <span className="font-bold text-[#222b45] text-[15px]">Rol</span>
             <span className="text-[#8f9bb3] text-[15px] capitalize">{role ?? "Empleado"}</span>
           </div>
           
           <div className="flex justify-between items-center pt-3">
             <span className="font-bold text-[#222b45] text-[15px]">Género</span>
             <div className="bg-[#f7f9fc] rounded-[10px] px-3 py-2 flex items-center gap-2 text-[15px] text-[#8f9bb3]">
                Masculino <ChevronDown className="w-4 h-4" />
             </div>
           </div>
        </div>
      </div>

      {/* Global Dialog Modal */}
      <GlobalDialog config={dialogConfig} onClose={closeDialog} />
    </main>
  );
}
