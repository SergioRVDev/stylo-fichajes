"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getAllEmployees, subscribeToDayLogs, getAuditLogs, addCorrectionLog, getCorrectionRequests, updateCorrectionRequestStatus } from "@/lib/firebase/database";
import { ScheduleForm, createDefaultSchedule } from "@/components/ScheduleForm";
import { Clock, Coffee, UserX, UserCheck, Users as UsersIcon, Bell, BellOff, CheckCircle, XCircle, ChevronLeft, Plus, X } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { DialogConfig, GlobalDialog } from "@/components/GlobalDialog";
import type { Employee, UserRole, WorkSchedule, TimeLog, TimeLogType, AuditLog, CorrectionRequest } from "@/types";

type EmployeeState = "active" | "paused" | "absent";

function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getYesterdayDate(): string {
  const yesterday = new Date(Date.now() - 86400000);
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, "0");
  const day = String(yesterday.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function computeCurrentState(logs: TimeLog[]): { state: EmployeeState; lastChange: number | null } {
  if (logs.length === 0) return { state: "absent", lastChange: null };
  const sorted = [...logs].sort((a, b) => a.timestamp - b.timestamp);
  const lastLog = sorted[sorted.length - 1];

  if (!lastLog) return { state: "absent", lastChange: null };

  let state: EmployeeState = "absent";
  if (lastLog.type === "IN" || lastLog.type === "BREAK_END") state = "active";
  else if (lastLog.type === "BREAK_START") state = "paused";
  else if (lastLog.type === "OUT") state = "absent";

  return { state, lastChange: lastLog.timestamp };
}

function UsuariosContent() {
  const router = useRouter();
  const { user, role, loading } = useAuth();
  const [employees, setEmployees] = useState<Record<string, Employee>>({});
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  
  // Monitor States
  const [logsMap, setLogsMap] = useState<Record<string, TimeLog[]>>({});
  const [filter, setFilter] = useState<"all" | "active" | "paused" | "absent">("all");

  // Dialog State
  const [dialogConfig, setDialogConfig] = useState<DialogConfig>({
    isOpen: false,
    title: "",
    message: "",
    type: "alert"
  });

  const closeDialog = () => setDialogConfig(prev => ({ ...prev, isOpen: false }));

  // Create / Edit form state
  const [showForm, setShowForm] = useState(false);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formLastName, setFormLastName] = useState("");
  const [formDni, setFormDni] = useState("");
  const [formBirthDate, setFormBirthDate] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("employee");
  const [formSchedule, setFormSchedule] = useState<WorkSchedule>(createDefaultSchedule());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [deletingUid, setDeletingUid] = useState<string | null>(null);

  // Correction and Audit States
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [showCorrModal, setShowCorrModal] = useState(false);
  const [corrTarget, setCorrTarget] = useState<{uid: string, emp: Employee} | null>(null);
  const [corrDate, setCorrDate] = useState(getTodayDate());
  const [corrType, setCorrType] = useState<TimeLogType>("IN");
  const [corrTime, setCorrTime] = useState("");
  const [corrReason, setCorrReason] = useState("");
  const [corrSubmitting, setCorrSubmitting] = useState(false);

  // Solicitudes (Correction Requests from employees)
  const [solicitudes, setSolicitudes] = useState<CorrectionRequest[]>([]);
  const [showSolicitudes, setShowSolicitudes] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Push Notifications
  const { status: pushStatus, requestPermission } = usePushNotifications(user?.uid);

  const pendingCount = solicitudes.filter(s => s.status === "pending").length;

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && role !== "manager") router.replace("/");
  }, [user, role, loading, router]);

  useEffect(() => {
    if (user && role === "manager") loadEmployees();
  }, [user, role]);

  // Load solicitudes when manager logs in
  useEffect(() => {
    if (user && role === "manager") {
      getCorrectionRequests("default").then(setSolicitudes).catch(console.error);
    }
  }, [user, role]);

  // Auto-open solicitudes panel if URL has ?tab=solicitudes
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("tab=solicitudes")) {
      setShowSolicitudes(true);
    }
  }, []);

  async function loadEmployees() {
    try {
      const emps = await getAllEmployees("default");
      const activeEmps = Object.fromEntries(
        Object.entries(emps).filter(([_, emp]) => emp.status !== "archived")
      );
      setEmployees(activeEmps);
    } catch {
      console.error("Error loading employees");
    } finally {
      setLoadingEmployees(false);
    }
  }

  // Real-time listeners for monitor
  useEffect(() => {
    if (!user || role !== "manager") return;

    let unsubs: (() => void)[] = [];
    const today = getTodayDate();
    const yesterday = getYesterdayDate();

    // Start listeners for whatever employees map currently has
    Object.keys(employees).forEach((uid) => {
      let yestLogs: TimeLog[] = [];
      let todLogs: TimeLog[] = [];

      const updateLogState = () => {
        const combined = [...yestLogs, ...todLogs].sort((a, b) => a.timestamp - b.timestamp);
        setLogsMap(prev => ({ ...prev, [uid]: combined }));
      };

      const unsubYest = subscribeToDayLogs("default", uid, yesterday, (logs) => {
        yestLogs = logs;
        updateLogState();
      });
      
      const unsubTod = subscribeToDayLogs("default", uid, today, (logs) => {
        todLogs = logs;
        updateLogState();
      });

      unsubs.push(unsubYest, unsubTod);
    });

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [user, role, employees]);

  function resetForm() {
    setFormName("");
    setFormLastName("");
    setFormDni("");
    setFormBirthDate("");
    setFormEmail("");
    setFormPassword("");
    setFormRole("employee");
    setFormSchedule(createDefaultSchedule());
    setFormError("");
    setEditingUid(null);
    setShowForm(false);
  }

  function startEdit(uid: string, emp: Employee) {
    setEditingUid(uid);
    setFormName(emp.displayName ?? "");
    setFormLastName(emp.lastName ?? "");
    setFormDni(emp.dni ?? "");
    setFormBirthDate(emp.birthDate ?? "");
    setFormEmail(emp.email);
    setFormPassword("");
    setFormRole(emp.role);
    setFormSchedule(emp.schedule ?? createDefaultSchedule());
    setFormError("");
    setFormSuccess("");
    setShowForm(true);
  }

  function startCreate() {
    resetForm();
    setFormSuccess("");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");
    setSubmitting(true);

    try {
      if (editingUid) {
        const response = await fetch("/api/users/create", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: editingUid,
            email: formEmail,
            displayName: formName,
            lastName: formLastName,
            dni: formDni,
            birthDate: formBirthDate,
            role: formRole,
            schedule: formSchedule,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setFormSuccess("Usuario actualizado correctamente");
      } else {
        if (!formPassword) {
          setFormError("La contraseña es obligatoria");
          setSubmitting(false);
          return;
        }
        const response = await fetch("/api/users/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: formEmail,
            password: formPassword,
            role: formRole,
            displayName: formName,
            lastName: formLastName,
            dni: formDni,
            birthDate: formBirthDate,
            schedule: formSchedule,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setFormSuccess(`Usuario ${data.email} creado correctamente`);
      }
      resetForm();
      await loadEmployees();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(uid: string) {
    setSubmitting(true);
    setFormError("");
    try {
      const response = await fetch(`/api/users/create?uid=${uid}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setFormSuccess("Usuario eliminado correctamente");
      setDeletingUid(null);
      await loadEmployees();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setSubmitting(false);
    }
  }

  async function openAudit() {
    setShowAuditModal(true);
    try {
      const logs = await getAuditLogs("default");
      setAuditLogs(logs);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCorrection(e: React.FormEvent) {
    e.preventDefault();
    if (!corrTarget || !corrReason.trim() || !user) return;
    
    setDialogConfig({
      isOpen: true,
      title: "Confirmar Corrección",
      message: `¿Estás seguro de inyectar un evento de tipo ${corrType} a las ${corrTime} para ${corrTarget.emp.displayName || corrTarget.emp.email}?\n\nEsta acción quedará registrada en auditoría.`,
      type: "confirm",
      onConfirm: async () => {
        closeDialog();
        setCorrSubmitting(true);
        try {
          await addCorrectionLog(
            "default",
            user.uid,
            user.email || "Admin",
            corrTarget.uid,
            corrTarget.emp.email,
            corrDate,
            corrType,
            corrTime,
            corrReason
          );
          setShowCorrModal(false);
          setDialogConfig({
            isOpen: true,
            title: "Éxito",
            message: "Corrección aplicada correctamente",
            type: "alert"
          });
        } catch (err) {
          console.error(err);
          setDialogConfig({
            isOpen: true,
            title: "Error",
            message: "Error al aplicar la corrección",
            type: "alert"
          });
        } finally {
          setCorrSubmitting(false);
        }
      }
    });
  }

  async function handleApproveSolicitud(req: CorrectionRequest) {
    setProcessingId(req.id);
    try {
      await addCorrectionLog(
        "default",
        user!.uid,
        user!.email ?? "",
        req.employeeUid,
        req.employeeEmail,
        req.date,
        req.logType,
        req.proposedTime,
        `[SOLICITUD APROBADA] ${req.reason}`
      );
      await updateCorrectionRequestStatus("default", req.id, "approved");
      setSolicitudes(prev => prev.map(s => s.id === req.id ? { ...s, status: "approved" } : s));
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingId(null);
    }
  }

  async function handleRejectSolicitud(req: CorrectionRequest) {
    setProcessingId(req.id);
    try {
      await updateCorrectionRequestStatus("default", req.id, "rejected");
      setSolicitudes(prev => prev.map(s => s.id === req.id ? { ...s, status: "rejected" } : s));
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingId(null);
    }
  }

  const employeeList = useMemo(() => {
    return Object.entries(employees).map(([uid, emp]) => {
      const userLogs = logsMap[uid] || [];
      const { state, lastChange } = computeCurrentState(userLogs);
      return { uid, emp, state, lastChange };
    });
  }, [employees, logsMap]);

  const stats = useMemo(() => {
    return {
      active: employeeList.filter(s => s.state === "active").length,
      paused: employeeList.filter(s => s.state === "paused").length,
      absent: employeeList.filter(s => s.state === "absent").length,
      total: employeeList.length,
    };
  }, [employeeList]);

  const filteredList = useMemo(() => {
    return employeeList
      .filter(s => filter === "all" || s.state === filter)
      .sort((a, b) => {
        // sorting by active > paused > absent > alphabetic
        if (a.state === "active" && b.state !== "active") return -1;
        if (a.state !== "active" && b.state === "active") return 1;
        if (a.state === "paused" && b.state === "absent") return -1;
        if (a.state === "absent" && b.state === "paused") return 1;
        const nameA = a.emp.displayName || a.emp.email;
        const nameB = b.emp.displayName || b.emp.email;
        return nameA.localeCompare(nameB);
      });
  }, [employeeList, filter]);

  if (loading || !user || role !== "manager") {
    return (
      <main className="flex min-h-dvh items-center justify-center pb-20">
        <p className="text-muted">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-col flex-1 w-full relative">
      {/* Dark Header Area */}
      <div className="flex h-[130px] items-start pt-6 px-4 relative justify-between text-white shrink-0">
        <button 
          onClick={() => router.back()}
          className="w-[42px] h-[42px] bg-white text-primary rounded-[14px] flex items-center justify-center shadow-sm"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center mt-1">
           <h1 className="text-lg font-medium leading-[1.2] text-center tracking-wide">Usuarios<br/>y permisos</h1>
        </div>
        <div className="flex items-center gap-2">
          {role === "manager" ? (
            <button
              onClick={() => setShowSolicitudes(true)}
              className="relative w-[42px] h-[42px] bg-white text-primary rounded-[14px] flex items-center justify-center shadow-sm"
            >
              <Bell className="w-5 h-5" />
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                  {pendingCount}
                </span>
              )}
            </button>
          ) : <div className="w-[42px]"></div>}
        </div>
      </div>

      {/* Main White Card Context */}
      <div className="flex-1 bg-surface rounded-t-[36px] px-5 pb-6 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.3)] w-full flex flex-col relative mt-[-20px] min-h-[calc(100vh-110px)]">
         <div className="flex justify-between items-center mb-6 mt-6">
            <button
              onClick={openAudit}
              className="rounded-xl border border-border bg-surface px-4 py-2 text-[13px] font-bold text-muted transition-colors hover:bg-muted/10 tracking-wide"
            >
              AUDITORÍA
            </button>
            <button
               onClick={() => (showForm ? resetForm() : startCreate())}
               className="rounded-xl bg-primary px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-primary-dark tracking-wide flex items-center gap-1"
             >
               {showForm ? <><X className="w-4 h-4"/> Cancelar</> : <><Plus className="w-4 h-4"/> Nuevo</>}
            </button>
         </div>

      <div className="grid grid-cols-4 gap-2 mb-2">
        <button 
          onClick={() => setFilter("all")}
          className={`relative flex flex-col items-center justify-center rounded-xl p-2 transition-colors ${filter === "all" ? "bg-primary/20 text-primary border border-primary/50" : "bg-surface border border-border hover:bg-muted/10"}`}
        >
          <span className="text-lg font-bold leading-none">{stats.total}</span>
          <span className="text-[9px] uppercase font-bold tracking-wider opacity-80 mt-1">Todos</span>
        </button>
        <button 
          onClick={() => setFilter("active")}
          className={`relative flex flex-col items-center justify-center rounded-xl p-2 transition-colors ${filter === "active" ? "bg-success/20 text-success border border-success/50" : "bg-surface border border-border hover:bg-muted/10"}`}
        >
          <span className="text-lg font-bold leading-none">{stats.active}</span>
          <span className="text-[9px] uppercase font-bold tracking-wider opacity-80 mt-1">Activos</span>
        </button>
        <button 
          onClick={() => setFilter("paused")}
          className={`relative flex flex-col items-center justify-center rounded-xl p-2 transition-colors ${filter === "paused" ? "bg-warning/20 text-warning-dark border border-warning/50" : "bg-surface border border-border hover:bg-muted/10"}`}
        >
          <span className="text-lg font-bold leading-none">{stats.paused}</span>
          <span className="text-[9px] uppercase font-bold tracking-wider opacity-80 mt-1">Pausa</span>
        </button>
        <button 
          onClick={() => setFilter("absent")}
          className={`relative flex flex-col items-center justify-center rounded-xl p-2 transition-colors ${filter === "absent" ? "bg-danger/20 text-danger border border-danger/50" : "bg-surface border border-border hover:bg-muted/10"}`}
        >
          <span className="text-lg font-bold leading-none">{stats.absent}</span>
          <span className="text-[9px] uppercase font-bold tracking-wider opacity-80 mt-1">Austs.</span>
        </button>
      </div>

      {formSuccess && (
        <div className="mt-4 rounded-xl bg-success/10 px-4 py-3 text-sm text-success">
          {formSuccess}
        </div>
      )}
      {formError && !showForm && (
        <div className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
          {formError}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 rounded-xl border border-border bg-surface p-4">
          <h2 className="font-semibold">
            {editingUid ? "Editar usuario" : "Crear nuevo usuario"}
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="formName" className="mb-1 block text-xs font-medium text-muted">Nombre</label>
              <input id="formName" type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" placeholder="Nombre" />
            </div>
            <div>
              <label htmlFor="formLastName" className="mb-1 block text-xs font-medium text-muted">Apellido</label>
              <input id="formLastName" type="text" value={formLastName} onChange={(e) => setFormLastName(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" placeholder="Apellido" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="formDni" className="mb-1 block text-xs font-medium text-muted">DNI / NIE</label>
              <input id="formDni" type="text" value={formDni} onChange={(e) => setFormDni(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" placeholder="00000000X" />
            </div>
            <div>
              <label htmlFor="formBirthDate" className="mb-1 block text-xs font-medium text-muted">Fecha Nacimiento</label>
              <input id="formBirthDate" type="date" value={formBirthDate} onChange={(e) => setFormBirthDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          <div>
            <label htmlFor="formEmail" className="mb-1 block text-xs font-medium text-muted">Correo *</label>
            <input id="formEmail" type="email" required value={formEmail} onChange={(e) => setFormEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" placeholder="email@ejemplo.com" />
          </div>

          {!editingUid && (
            <div>
              <label htmlFor="formPassword" className="mb-1 block text-xs font-medium text-muted">Contraseña *</label>
              <input id="formPassword" type="password" required minLength={6} value={formPassword} onChange={(e) => setFormPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" placeholder="Mín. 6 caracteres" />
            </div>
          )}

          <div>
            <label htmlFor="formRole" className="mb-1 block text-xs font-medium text-muted">Rol</label>
            <select id="formRole" value={formRole} onChange={(e) => setFormRole(e.target.value as UserRole)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30">
              <option value="employee">Empleado</option>
              <option value="manager">Manager</option>
            </select>
          </div>

          <ScheduleForm schedule={formSchedule} onChange={setFormSchedule} />

          {formError && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{formError}</p>
          )}

          <button type="submit" disabled={submitting}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50">
            {submitting ? (editingUid ? "Guardando..." : "Creando...") : (editingUid ? "Guardar cambios" : "Crear usuario")}
          </button>
        </form>
      )}

      <div className="mt-6 space-y-2">
        {loadingEmployees ? (
          <p className="text-center text-sm text-muted">Cargando usuarios...</p>
        ) : employeeList.length === 0 ? (
          <p className="text-center text-sm text-muted">No hay usuarios bajo este filtro</p>
        ) : (
          filteredList.map(({ uid, emp, state, lastChange }) => (
            <div 
              key={uid} 
              onClick={() => router.push(`/fichajes?uid=${uid}`)}
              className="rounded-xl border border-border bg-surface p-4 cursor-pointer hover:border-primary/50 transition-all hover:bg-slate-50 relative group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div 
                      className={`flex h-3 w-3 shrink-0 rounded-full shadow-sm ${
                        state === "active" ? "bg-success" : 
                        state === "paused" ? "bg-warning" : 
                        "bg-danger"
                      }`}
                      title={state === "active" ? "Activo" : state === "paused" ? "Pausa" : "Ausente"}
                    />
                    <p className="font-medium truncate group-hover:text-primary transition-colors">
                      {emp.displayName || emp.email.split("@")[0]}
                      {emp.lastName ? ` ${emp.lastName}` : ""}
                    </p>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{emp.email}</p>
                  
                  {(emp.dni || emp.birthDate) && (
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted/80">
                      {emp.dni && <span>DNI: <span className="text-foreground/80">{emp.dni}</span></span>}
                      {emp.dni && emp.birthDate && <span className="text-border">•</span>}
                      {emp.birthDate && <span>Nac: <span className="text-foreground/80">{new Date(emp.birthDate).toLocaleDateString("es-ES")}</span></span>}
                    </div>
                  )}

                  <div className="mt-2 flex items-center gap-2">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      state === "active" ? "bg-success/15 text-success" : 
                      state === "paused" ? "bg-warning/15 text-warning-dark" : 
                      "bg-danger/15 text-danger"
                    }`}>
                      {state === "active" ? "Activo" : state === "paused" ? "En pausa" : "Ausente"}
                    </span>
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${emp.role === "manager" ? "bg-primary/10 text-primary" : "bg-muted/10 text-muted"}`}>
                      {emp.role === "manager" ? "Responsable" : "Empleado"}
                    </span>
                  
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button onClick={(e) => { e.stopPropagation(); startEdit(uid, emp); }} className="rounded-lg p-2 text-muted hover:bg-primary/10 hover:text-primary transition-colors bg-white/50" aria-label="Editar">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  {deletingUid === uid ? (
                    <div className="flex items-center gap-1 bg-white/50 rounded-lg p-1">
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(uid); }} disabled={submitting} className="rounded-lg bg-danger px-2 py-1 text-xs font-medium text-white hover:bg-danger/80 disabled:opacity-50 transition-colors">Sí</button>
                      <button onClick={(e) => { e.stopPropagation(); setDeletingUid(null); }} className="rounded-lg bg-muted/20 px-2 py-1 text-xs font-medium hover:bg-muted/30 transition-colors">No</button>
                    </div>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); setDeletingUid(uid); }} className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger bg-white/50 transition-colors" aria-label="Eliminar">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Correction Form Modal */}
      {showCorrModal && corrTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="font-bold">Corregir Fichaje</h3>
              <button onClick={() => setShowCorrModal(false)} className="rounded-full p-1 text-muted hover:bg-muted/10">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <form onSubmit={handleCorrection} className="p-4 flex flex-col gap-4">
              <p className="text-sm font-medium">Empleado: {corrTarget.emp.displayName || corrTarget.emp.email}</p>
              
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-muted">Fecha *</label>
                  <input type="date" required value={corrDate} onChange={e => setCorrDate(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Hora *</label>
                  <input type="time" required value={corrTime} onChange={e => setCorrTime(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Tipo de Evento *</label>
                <select value={corrType} onChange={e => setCorrType(e.target.value as TimeLogType)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="IN">Entrada</option>
                  <option value="BREAK_START">Inicio Pausa</option>
                  <option value="BREAK_END">Fin Pausa</option>
                  <option value="OUT">Salida</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Motivo de la corrección *</label>
                <textarea required minLength={5} value={corrReason} onChange={e => setCorrReason(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none min-h-[80px] focus:ring-2 focus:ring-primary/30" placeholder="Ej: Se olvidó de fichar al salir ayer..."></textarea>
              </div>

              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setShowCorrModal(false)} className="flex-1 rounded-xl border border-border bg-surface py-2 text-sm font-medium transition-colors hover:bg-muted/10">Cancelar</button>
                <button type="submit" disabled={corrSubmitting} className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50">Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit Log Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
              <h3 className="font-bold">Auditoría de Correcciones</h3>
              <button onClick={() => setShowAuditModal(false)} className="rounded-full p-1 text-muted hover:bg-muted/10">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-full">
              {auditLogs.length === 0 ? (
                <p className="text-center text-sm text-muted py-8">No hay registros de auditoría.</p>
              ) : (
                <div className="space-y-3">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-semibold text-primary">Inyección de {log.details.logType}</span>
                        <span className="text-xs text-muted">{new Date(log.timestamp).toLocaleString("es-ES")}</span>
                      </div>
                      <p className="mb-1"><strong>Empleado:</strong> {log.targetEmail}</p>
                      <p className="mb-1"><strong>Ejecutado por:</strong> {log.editedByEmail}</p>
                      <p className="mb-2"><strong>Fecha inyectada:</strong> {log.details.date} a las {new Date(log.details.logTimestamp).toLocaleTimeString("es-ES", {hour: '2-digit', minute:'2-digit'})}</p>
                      <div className="bg-background rounded p-2 border border-border/50">
                        <p className="text-xs text-muted font-medium mb-1">Motivo:</p>
                        <p className="text-sm italic">&quot;{log.reason}&quot;</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Solicitudes Inbox Panel */}
      {showSolicitudes && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
            <div>
              <h3 className="font-bold text-lg">Solicitudes de Corrección</h3>
              <p className="text-xs text-muted">{pendingCount} pendiente{pendingCount !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Push Notification toggle */}
              <button
                onClick={requestPermission}
                disabled={pushStatus === "requesting" || pushStatus === "granted"}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                  pushStatus === "granted"
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-border bg-surface hover:bg-muted/10 text-muted"
                }`}
              >
                {pushStatus === "granted" ? (
                  <><Bell className="w-3 h-3" /> Notif. activas</>
                ) : pushStatus === "requesting" ? (
                  "Activando..."
                ) : (
                  <><BellOff className="w-3 h-3" /> Activar notif.</>
                )}
              </button>
              <button onClick={() => setShowSolicitudes(false)} className="rounded-full p-2 hover:bg-muted/10">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {solicitudes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                <CheckCircle className="h-10 w-10 text-muted/30" />
                <p className="text-sm text-muted">No hay solicitudes de correción.</p>
              </div>
            ) : (
              solicitudes.map(req => (
                <div key={req.id} className={`rounded-2xl border p-4 ${
                  req.status === "pending" ? "border-border bg-surface" :
                  req.status === "approved" ? "border-success/20 bg-success/5" :
                  "border-danger/20 bg-danger/5 opacity-60"
                }`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-semibold text-sm">{req.employeeName || req.employeeEmail}</p>
                      <p className="text-xs text-muted">
                        {new Date(req.date + "T00:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${
                      req.status === "pending" ? "bg-amber-100 text-amber-700" :
                      req.status === "approved" ? "bg-success/10 text-success" :
                      "bg-danger/10 text-danger"
                    }`}>
                      {req.status === "pending" ? "Pendiente" : req.status === "approved" ? "Aprobada" : "Rechazada"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                    <div className="bg-background rounded-lg p-2 border border-border/50">
                      <p className="text-muted mb-0.5">Tipo</p>
                      <p className="font-semibold">{req.logType === "IN" ? "Entrada" : req.logType === "OUT" ? "Salida" : req.logType === "BREAK_START" ? "Ini. Pausa" : "Fin Pausa"}</p>
                    </div>
                    <div className="bg-background rounded-lg p-2 border border-border/50">
                      <p className="text-muted mb-0.5">Hora propuesta</p>
                      <p className="font-semibold">{req.proposedTime}</p>
                    </div>
                  </div>

                  <div className="bg-background rounded-lg p-2.5 border border-border/50 mb-3">
                    <p className="text-xs text-muted mb-0.5 font-medium">Motivo del empleado:</p>
                    <p className="text-sm italic">"{req.reason}"</p>
                  </div>

                  {req.status === "pending" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRejectSolicitud(req)}
                        disabled={processingId === req.id}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-danger/30 bg-danger/5 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" /> Rechazar
                      </button>
                      <button
                        onClick={() => handleApproveSolicitud(req)}
                        disabled={processingId === req.id}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-success py-2.5 text-sm font-bold text-white transition-colors hover:bg-success/80 disabled:opacity-50"
                      >
                        {processingId === req.id ? (
                          <span className="animate-pulse">Procesando...</span>
                        ) : (
                          <><CheckCircle className="w-4 h-4" /> Aprobar</>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
      </div>
      {/* Global Dialog Modal */}
      <GlobalDialog config={dialogConfig} onClose={closeDialog} />
    </main>
  );
}

export default function UsuariosPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex flex-col p-6 items-center justify-center">Cargando usuarios...</div>}>
      <UsuariosContent />
    </Suspense>
  );
}
