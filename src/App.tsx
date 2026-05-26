import { useEffect, useState, useMemo, useRef, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SEED_PARTNER_EMAILS, UserRole, ViewMode } from './constants';
import { 
  BarChart3, 
  Calendar, 
  LayoutDashboard, 
  Layers, 
  AlertTriangle, 
  Settings, 
  Plus, 
  TrendingUp, 
  Search, 
  Upload,
  ImagePlus,
  Filter,
  User,
  LogOut,
  ChevronRight,
  Monitor,
  CheckCircle2,
  Clock,
  Video,
  MoreVertical,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Hash,
  ArrowUpRight,
  Zap,
  Lock,
  Building2,
  User as UserIcon,
  Users as UsersIcon,
  Menu,
  Music,
  ClipboardList,
  CheckCircle,
  FileVideo,
  Archive,
  Check,
  ExternalLink,
  ChevronLeft,
  RotateCcw,
  HelpCircle,
  X,
  Play,
  Trash2,
  Pencil,
  Camera,
  Folder,
  EyeOff,
  UserCircle,
  UserPlus,
  Trophy,
  Star,
  Target,
  Download,
  CloudUpload,
  FileAudio,
  Save,
  Link2,
  Sparkles,
  Send,
  MessageSquare,
  Bot,
  Copy
} from 'lucide-react';
import { auth, googleProvider, db, handleFirestoreError, OperationType, storage, ref, uploadBytes, getDownloadURL, driveProvider, testFirestoreConnection, getDocFromServer, getDoc, enableNetwork, signInWithRedirect } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser, GoogleAuthProvider } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  orderBy,
  limit,
  setDoc,
  serverTimestamp,
  arrayUnion,
  getDocs
} from 'firebase/firestore';
import { 
  Account, 
  AccountStatus, 
  AccountStage, 
  Product, 
  ScheduleItem, 
  Violation,
  WinningStatus,
  ScheduleStatus,
  Sale,
  UserProfile,
  Producer,
  TiktokLink
} from './types';

// Components
const phaseMap: Record<string, string> = {
  [WinningStatus.TESTING]: 'Teste',
  [WinningStatus.POTENTIAL]: 'Saindo do Teste',
  [WinningStatus.WINNER]: 'Validação',
  [WinningStatus.SCALED]: 'Escala'
};

function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

function addDaysToLocalDateString(dateString: string, days: number): string {
  const date = parseLocalDate(dateString);
  date.setDate(date.getDate() + days);
  return getLocalDateString(date);
}

function normalizeFileList(value: any): any[] {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function hasEditableMaterial(item: ScheduleItem): boolean {
  const rawItem = item as any;
  return [
    item.audioMaterial,
    item.videoMaterial,
    rawItem.baseAudio,
    rawItem.rawMaterials,
    rawItem.uploadedFiles,
    rawItem.materials,
    rawItem.materialBruto,
    rawItem.materiaisBrutos,
  ].some(value => normalizeFileList(value).length > 0);
}

function hasSupplierPreparedMaterial(item: ScheduleItem): boolean {
  const rawItem = item as any;
  return [
    item.audioMaterial,
    item.videoMaterial,
    rawItem.baseAudio,
    rawItem.rawMaterials,
    rawItem.uploadedFiles,
    rawItem.materials,
    rawItem.materialBruto,
    rawItem.materiaisBrutos,
  ].some(value => normalizeFileList(value).length > 0);
}

function isScheduleAssignedToSupplier(item: ScheduleItem, supplierId?: string): boolean {
  return !!supplierId && item.supplierId === supplierId;
}

function needsSupplierDashboardAction(item: ScheduleItem, supplierId?: string): boolean {
  if (!isScheduleAssignedToSupplier(item, supplierId)) return false;
  if (item.status !== ScheduleStatus.PLANNED) return false;
  if (hasSupplierPreparedMaterial(item)) return false;
  return true;
}

function getSupplierUploadBlockMessages(hasContentLink: boolean, hasLinkedEditor: boolean): string[] {
  const messages: string[] = [];
  if (!hasContentLink) messages.push('Adicione o link do conteúdo');
  if (!hasLinkedEditor) messages.push('Vincule um editor');
  return messages;
}

function getProducerLinkedUserId(producer?: Producer | null): string | undefined {
  if (!producer) return undefined;
  return producer.linkedUserId || producer.collaboratorUserId || producer.editorUserId || producer.supplierUserId;
}

function getProducerLinkedEmail(producer?: Producer | null): string | undefined {
  if (!producer) return undefined;
  const rawProducer = producer as any;
  return producer.linkedUserEmail || producer.linkedEmail || rawProducer.collaboratorEmail || rawProducer.editorEmail || rawProducer.supplierEmail;
}

function hasProducerUserLink(producer?: Producer | null): boolean {
  return !!(getProducerLinkedUserId(producer) || getProducerLinkedEmail(producer));
}

function getProducerLinkedRole(producer?: Producer | null): 'editor' | 'supplier' | undefined {
  if (!producer) return undefined;
  if (producer.editorUserId && !producer.supplierUserId) return 'editor';
  if (producer.supplierUserId && !producer.editorUserId) return 'supplier';
  return producer.role === 'editor' || producer.role === 'supplier' ? producer.role : undefined;
}

function isProducerAvailableForRole(producer: Producer, role: 'editor' | 'supplier'): boolean {
  if (producer.hidden) return false;
  if (!hasProducerUserLink(producer)) return true;
  return getProducerLinkedRole(producer) === role;
}

function getProducerStatusLabel(producer: Producer, role: 'editor' | 'supplier'): string {
  if (!hasProducerUserLink(producer)) return 'Aguardando Atribuição';
  return role === 'supplier' ? 'Fornecedor Ativo' : 'Editor Ativo';
}

function isProducerLinkedToUser(producer: Producer, user: FirebaseUser): boolean {
  const linkedId = getProducerLinkedUserId(producer);
  const linkedEmail = getProducerLinkedEmail(producer);
  return linkedId === user.uid || (!!linkedEmail && linkedEmail.toLowerCase() === user.email?.toLowerCase());
}

const compliancePages = {
  '/privacy-policy': {
    title: 'Privacy Policy – Influency Club',
    heading: 'Privacy Policy',
    description: 'Learn how Influency Club collects, processes, and protects personal information for TikTok Shop workflows.',
    sections: [
      {
        paragraphs: [
          'Influency Club respects user privacy and is committed to protecting personal information.',
          'The application collects and processes only the data required to provide TikTok Shop integration, account management, production workflow, content organization, user roles, and operational functionality.'
        ]
      },
      {
        heading: 'Data We May Process',
        list: [
          'user name and email from Google Authentication',
          'user role and permission level',
          'collaborator/editor/supplier assignment data',
          'product and production workflow data',
          'uploaded production files',
          'TikTok Shop authorization and integration data, when enabled'
        ]
      },
      {
        paragraphs: [
          'We do not sell personal information to third parties.',
          'Data is processed securely using encrypted connections and trusted cloud infrastructure providers, including Firebase, Firestore, Google Authentication, and Render.',
          'Access to information is restricted by user role. Users only access the data required for their operational function.'
        ]
      },
      {
        heading: 'Data Requests',
        paragraphs: ['Users may request deletion of their data or revoke access at any time by contacting:']
      }
    ]
  },
  '/terms-of-service': {
    title: 'Terms of Service – Influency Club',
    heading: 'Terms of Service',
    description: 'Review the terms for authorized use of the Influency Club operational workflow application.',
    sections: [
      {
        paragraphs: [
          'Influency Club is an internal operational tool for managing TikTok Shop content workflows, creators, editors, suppliers, products, and publication processes.',
          'By using this application, users agree to use it only for authorized business purposes.',
          'Users must not upload illegal, harmful, or unauthorized content.',
          'Users are responsible for ensuring that uploaded files, links, and production materials comply with applicable laws and platform policies.',
          'Influency Club may update or restrict access to protect system security, user data, or operational integrity.',
          'For questions, contact:'
        ]
      }
    ]
  },
  '/security': {
    title: 'Data Security – Influency Club',
    heading: 'Data Security',
    description: 'Understand the administrative, technical, and operational safeguards used by Influency Club.',
    sections: [
      {
        paragraphs: [
          'Influency Club applies reasonable administrative, technical, and operational safeguards to protect user and business data.'
        ]
      },
      {
        heading: 'Security Practices',
        list: [
          'Google Authentication for user login',
          'role-based access control',
          'restricted access by account type',
          'encrypted HTTPS connections',
          'Firebase/Firestore security rules',
          'separation between editor, supplier, and partner roles',
          'limited data access based on operational need',
          'no sale of personal data',
          'deletion or access revocation available upon request'
        ]
      },
      {
        paragraphs: [
          'Only authorized users may access internal production data.',
          'For security or data protection requests, contact:'
        ]
      }
    ]
  },
  '/data-deletion': {
    title: 'Data Deletion Request – Influency Club',
    heading: 'Data Deletion Request',
    description: 'Request deletion of personal data, account association, authorization records, or access records.',
    sections: [
      {
        paragraphs: [
          'Users may request deletion of their personal data, account association, authorization records, or operational access records.',
          'To request deletion, contact:'
        ]
      },
      {
        heading: 'Please Include',
        list: [
          'your name',
          'your account email',
          'the type of data you want deleted',
          'the reason for the request, if applicable'
        ]
      },
      {
        paragraphs: [
          'Requests will be reviewed and processed within a reasonable period.',
          'When possible, access may also be revoked by disconnecting the authorization from the connected platform.'
        ]
      }
    ]
  }
} as const;

type CompliancePath = keyof typeof compliancePages;
type CompliancePageConfig = typeof compliancePages[CompliancePath];

const complianceLinks = [
  { path: '/privacy-policy', label: 'Privacy Policy' },
  { path: '/terms-of-service', label: 'Terms of Service' },
  { path: '/security', label: 'Data Security' },
  { path: '/data-deletion', label: 'Data Deletion' }
] as const;

function getCompliancePage(pathname: string): CompliancePageConfig | null {
  const normalizedPath = pathname.replace(/\/$/, '') || '/';
  return normalizedPath in compliancePages ? compliancePages[normalizedPath as CompliancePath] : null;
}

function ComplianceFooter() {
  return (
    <footer className="border-t border-[#222] bg-[#090909]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 py-8 text-sm text-gray-500 md:flex-row md:items-center md:justify-between">
        <p>Influency Club</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          {complianceLinks.map(link => (
            <a key={link.path} href={link.path} className="hover:text-white transition-colors">
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}

function CompliancePage({ page }: { page: CompliancePageConfig }) {
  useEffect(() => {
    document.title = page.title;
    let metaDescription = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.name = 'description';
      document.head.appendChild(metaDescription);
    }
    metaDescription.content = page.description;
  }, [page]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-300 flex flex-col">
      <header className="border-b border-[#222] bg-[#0a0a0a]/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-5">
          <a href="/" className="flex items-center gap-3 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-black">
              <Zap className="h-5 w-5" />
            </span>
            <span className="font-bold tracking-tight">Influency Club</span>
          </a>
          <a href="/" className="hidden text-sm text-gray-500 hover:text-white transition-colors sm:inline">
            Sign in
          </a>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-5 py-10 md:py-16">
          <div className="mb-8 flex flex-col gap-4 border-b border-[#222] pb-8">
            <p className="text-xs font-black uppercase tracking-widest text-orange-400">Last updated: May 24, 2026</p>
            <div className="space-y-3">
              <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">{page.title}</h1>
              <p className="max-w-3xl text-base leading-7 text-gray-400">{page.description}</p>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
            <article className="space-y-8 rounded-2xl border border-[#222] bg-[#111] p-6 shadow-2xl md:p-8">
              {page.sections.map((section, index) => (
                <section key={index} className="space-y-4">
                  {section.heading && <h2 className="text-lg font-bold text-white">{section.heading}</h2>}
                  {section.paragraphs?.map((paragraph, paragraphIndex) => (
                    <p key={paragraphIndex} className="text-sm leading-7 text-gray-300">
                      {paragraph}
                    </p>
                  ))}
                  {section.list && (
                    <ul className="space-y-3">
                      {section.list.map(item => (
                        <li key={item} className="flex gap-3 text-sm leading-6 text-gray-300">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}

              <a
                href="mailto:mayconbussines12@gmail.com"
                className="inline-flex max-w-full items-center gap-2 rounded-xl border border-orange-500/25 bg-orange-500/10 px-4 py-3 text-sm font-semibold text-orange-200 hover:bg-orange-500/15 transition-colors break-all"
              >
                mayconbussines12@gmail.com
                <ExternalLink className="h-4 w-4 shrink-0" />
              </a>
            </article>

            <aside className="space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-gray-600">Compliance Pages</p>
              <nav className="rounded-2xl border border-[#222] bg-[#111] p-2">
                {complianceLinks.map(link => {
                  const isActive = page.title.startsWith(link.label);
                  return (
                    <a
                      key={link.path}
                      href={link.path}
                      className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm transition-colors ${isActive ? 'bg-white text-black font-bold' : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-white'}`}
                    >
                      {link.label}
                      <ChevronRight className="h-4 w-4" />
                    </a>
                  );
                })}
              </nav>
            </aside>
          </div>
        </section>
      </main>

      <ComplianceFooter />
    </div>
  );
}

const Login = ({ onBack, onLoginSuccess }: { onBack: () => void, onLoginSuccess: (token: string) => void }) => {
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      onLoginSuccess(credential?.accessToken || '');
    } catch (error: any) {
      console.error('Google login error:', error);

      const code = error?.code || '';
      if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectError: any) {
          console.error('Google redirect login error:', redirectError);
          setLoginError(redirectError?.message || 'NÃ£o foi possÃ­vel abrir o login do Google.');
        }
      } else if (code === 'auth/unauthorized-domain') {
        setLoginError('DomÃ­nio nÃ£o autorizado no Firebase Auth. Adicione localhost nos domÃ­nios autorizados do projeto.');
      } else if (code === 'auth/operation-not-allowed') {
        setLoginError('Login com Google nÃ£o estÃ¡ habilitado no Firebase Authentication deste projeto.');
      } else {
        setLoginError(error?.message || 'NÃ£o foi possÃ­vel entrar com Google.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-[#141414] border border-[#222] p-8 rounded-2xl shadow-2xl text-center relative"
      >
        <button 
          onClick={onBack}
          className="absolute top-6 left-6 text-gray-500 hover:text-white transition-colors"
        >
          <LogOut className="w-5 h-5 rotate-180" />
        </button>

        <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Zap className="text-white w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2 font-sans tracking-tight">Influency Club</h1>
        <p className="text-gray-400 mb-8">Organize suas contas, produtos e rotina de postagens em um só lugar.</p>
        <button 
          onClick={handleLogin}
          disabled={isLoggingIn}
          className="w-full bg-white text-black font-semibold py-3 px-6 rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
          {isLoggingIn ? 'Abrindo Google...' : 'Entrar com Google'}
        </button>
        {loginError && (
          <div className="mt-4 bg-red-500/10 border border-red-500/20 text-red-300 text-xs text-left p-3 rounded-xl">
            {loginError}
          </div>
        )}
        <nav className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-[#222] pt-5 text-[11px] text-gray-500">
          {complianceLinks.map(link => (
            <a key={link.path} href={link.path} className="hover:text-white transition-colors">
              {link.label}
            </a>
          ))}
        </nav>
      </motion.div>
    </div>
  );
};

const LayerSelection = ({ onSelect, userEmail }: { onSelect: (mode: ViewMode) => void, userEmail: string | null }) => {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-2">
          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center mx-auto mb-4"
          >
            <Zap className="text-black w-6 h-6" />
          </motion.div>
          <h1 className="text-3xl font-black text-white font-sans tracking-tight">Escolha sua Camada</h1>
          <p className="text-gray-500">Selecione como deseja acessar o Influency Club com {userEmail}.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <motion.button
            whileHover={{ y: -5, borderColor: 'rgba(255,255,255,0.2)' }}
            onClick={() => onSelect(ViewMode.PERSONAL)}
            className="flex flex-col items-center gap-6 p-10 bg-[#141414] border border-[#222] rounded-[2.5rem] transition-all text-center group"
          >
            <div className="w-20 h-20 bg-blue-500/10 rounded-3xl flex items-center justify-center border border-blue-500/20 group-hover:bg-blue-500 group-hover:text-black transition-colors">
              <UserIcon className="w-10 h-10 text-blue-500 group-hover:text-black" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">Conta Pessoal</h3>
              <p className="text-sm text-gray-500">Gerencie suas próprias contas e produtos de forma privada.</p>
            </div>
            <div className="mt-4 px-4 py-2 bg-[#0a0a0a] rounded-xl text-[10px] font-black uppercase text-blue-500 tracking-widest border border-blue-500/20">
              Acesso Individual
            </div>
          </motion.button>

          <motion.button
            whileHover={{ y: -5, borderColor: 'rgba(255,165,0,0.2)' }}
            onClick={() => onSelect(ViewMode.COMPANY)}
            className="flex flex-col items-center gap-6 p-10 bg-[#141414] border border-[#222] rounded-[2.5rem] transition-all text-center group"
          >
            <div className="w-20 h-20 bg-orange-500/10 rounded-3xl flex items-center justify-center border border-orange-500/20 group-hover:bg-orange-500 group-hover:text-black transition-colors">
              <Building2 className="w-10 h-10 text-orange-500 group-hover:text-black" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">Conta Empresa</h3>
              <p className="text-sm text-gray-500">Colabore com sua equipe em um ecossistema compartilhado.</p>
            </div>
            <div className="mt-4 px-4 py-2 bg-[#0a0a0a] rounded-xl text-[10px] font-black uppercase text-orange-500 tracking-widest border border-orange-500/20">
              Acesso Coletivo
            </div>
          </motion.button>
        </div>
        
        <div className="text-center pt-4">
          <button onClick={() => signOut(auth)} className="text-gray-600 hover:text-white text-sm transition-colors flex items-center gap-2 mx-auto">
            <LogOut className="w-4 h-4" />
            Sair da conta
          </button>
          <nav className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-gray-600">
            {complianceLinks.map(link => (
              <a key={link.path} href={link.path} className="hover:text-white transition-colors">
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
};


// Fresh build and restart trigger
export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode | null>(null);
  const [selectedMode, setSelectedMode] = useState<ViewMode | null>(null); // Initial selection
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountsExpanded, setAccountsExpanded] = useState(true);
  const [productsExpanded, setProductsExpanded] = useState(true);
  const [productionExpanded, setProductionExpanded] = useState(true);
  const [expandedProductAccounts, setExpandedProductAccounts] = useState<string | null>(null);
  const [salesTimeWindow, setSalesTimeWindow] = useState<'today' | 'yesterday' | '7' | '30' | '90' | 'custom'>('30');
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  const [showAllTopProducts, setShowAllTopProducts] = useState(false);
  const [showAllTopAccounts, setShowAllTopAccounts] = useState(false);
  
  // Data State
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [producers, setProducers] = useState<Producer[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [tiktokLinks, setTiktokLinks] = useState<TiktokLink[]>([]);
  const [completedSuggestions, setCompletedSuggestions] = useState<Set<string>>(new Set());
  const [driveAccessToken, setDriveAccessToken] = useState<string | null>(null);
  const [driveConfigured, setDriveConfigured] = useState<boolean>(false);
  const [productionActiveProducerId, setProductionActiveProducerId] = useState<string | null>(null);
  const [productionActiveProductId, setProductionActiveProductId] = useState<string | null>(null);
  
  const checkedAccountsRef = useRef<Set<string>>(new Set());

  const linkedProducer = useMemo(() => {
    if (!user) return undefined;

    const linkedByUser = producers.filter(p => isProducerLinkedToUser(p, user));
    if (linkedByUser.length === 0) return undefined;

    const profileEditorId = profile?.editorId || profile?.producerId || profile?.collaboratorId;
    const profileSupplierId = profile?.supplierId || profile?.producerId || profile?.collaboratorId;

    if (profile?.producerRole === 'editor' || profile?.collaboratorRole === 'editor') {
      return linkedByUser.find(p => p.id === profileEditorId && getProducerLinkedRole(p) === 'editor') ||
        linkedByUser.find(p => getProducerLinkedRole(p) === 'editor');
    }

    if (profile?.producerRole === 'supplier' || profile?.collaboratorRole === 'supplier') {
      return linkedByUser.find(p => p.id === profileSupplierId && getProducerLinkedRole(p) === 'supplier') ||
        linkedByUser.find(p => getProducerLinkedRole(p) === 'supplier');
    }

    return linkedByUser[0];
  }, [user, producers, profile]);
  const userRole = getProducerLinkedRole(linkedProducer);
  const supplierDashboardSchedule = useMemo(() => {
    if (userRole !== 'supplier') return schedule;
    return linkedProducer ? schedule.filter(item => isScheduleAssignedToSupplier(item, linkedProducer.id)) : [];
  }, [schedule, userRole, linkedProducer]);
  const supplierDashboardAccountIds = useMemo(() => {
    if (userRole !== 'supplier') return null;
    return new Set(supplierDashboardSchedule.map(item => item.accountId).filter(Boolean));
  }, [supplierDashboardSchedule, userRole]);
  const dashboardAccounts = useMemo(() => {
    if (userRole !== 'supplier' || !supplierDashboardAccountIds) return accounts;
    return accounts.filter(account => supplierDashboardAccountIds.has(account.id));
  }, [accounts, userRole, supplierDashboardAccountIds]);
  const dashboardViolations = useMemo(() => {
    if (userRole !== 'supplier' || !supplierDashboardAccountIds) return violations;
    return violations.filter(violation => supplierDashboardAccountIds.has(violation.accountId));
  }, [violations, userRole, supplierDashboardAccountIds]);

  useEffect(() => {
    if (user) {
      fetch(`/api/drive/status`)
        .then(r => r.json())
        .then(data => setDriveConfigured(data.configured))
        .catch(err => console.error('Error fetching drive status:', err));
    }
  }, [user]);

  useEffect(() => {
    // Warm up Firestore connection early
    testFirestoreConnection();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
      if (!u) {
        setProfile(null);
        setViewMode(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Effect to handle profile fetching once user and selectedMode are ready
  useEffect(() => {
    console.log('Profile Sync Check:', { user: !!user, selectedMode, viewMode, hasError: !!error });
    if (user && selectedMode && !viewMode && !error) {
      console.log('Triggering selectAccessMode');
      selectAccessMode(selectedMode);
    }
  }, [user, selectedMode, viewMode, error]);

  // Automatically configure view state and default tab redirections for editors and suppliers
  useEffect(() => {
    if ((userRole === 'editor' || userRole === 'supplier') && linkedProducer) {
      if (viewMode !== ViewMode.COMPANY) {
        setViewMode(ViewMode.COMPANY);
      }
      if (activeTab === 'planner' && userRole === 'editor') {
        setActiveTab('production_line');
      }
      if (userRole === 'editor' && !productionActiveProducerId) {
        setProductionActiveProducerId(linkedProducer.id);
      }
    }
  }, [userRole, linkedProducer, viewMode, activeTab, productionActiveProducerId]);

  const selectAccessMode = async (mode: ViewMode) => {
    if (!user) {
      console.warn('Cannot select access mode: User not logged in');
      return;
    }
    setLoading(true);
    setError(null);
    
    // Check if user is truly offline
    if (!window.navigator.onLine) {
      setError('Você parece estar offline. Verifique sua conexão com a internet para continuar.');
      setLoading(false);
      return;
    }

    const profileId = `${user.uid}_${mode}`;
    console.log('Initiating selection for:', mode, 'Profile ID:', profileId);
    
    const fetchProfile = async (retryCount = 0): Promise<void> => {
      try {
        if (!user) {
          console.error('No authenticated user found');
          setError('Sessão expirada. Por favor, entre novamente.');
          setLoading(false);
          return;
        }

        const profileRef = doc(db, 'user_profiles', profileId);
        console.log('Profile loading attempt:', retryCount + 1, 'for', profileId, 'User:', user.uid);
        
        // On retry, try to force network enablement
        if (retryCount > 0) {
          try {
            await enableNetwork(db);
            console.log('Network enabled manually');
          } catch (e) {
            console.warn('Could not enable network manually:', e);
          }
        }

        // Use a more generous timeout for slow connections
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), 25000)
        );
        
        // Use getDoc with the client db (which now has the correct databaseId)
        const profileSnap = await Promise.race([
          getDoc(profileRef),
          timeoutPromise
        ]) as any;
        
        if (profileSnap.exists()) {
          const data = profileSnap.data() as UserProfile;
          setProfile(data);
          setViewMode(mode);
          setLoading(false);
          console.log('Profile loaded successfully');
        } else {
          console.log('Profile not found, creating new one...');
          // Profile doesn't exist
          let role: 'PARTNER' | 'EMPLOYEE' = 'EMPLOYEE';
          if (mode === ViewMode.PERSONAL) {
            role = 'PARTNER'; 
          } else if (mode === ViewMode.COMPANY) {
            if (SEED_PARTNER_EMAILS.includes(user.email || '')) {
              role = 'PARTNER';
            } else {
              role = 'EMPLOYEE';
            }
          }

          const newProfile: UserProfile = {
            id: profileId,
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || 'Usuário',
            photoURL: user.photoURL || undefined,
            role,
            viewMode: mode,
            createdAt: serverTimestamp()
          };
          
          await setDoc(profileRef, newProfile);
          
          setProfile(newProfile as any);
          setViewMode(mode);
          setLoading(false);
          console.log('Profile created and loaded');
        }
      } catch (e: any) {
        console.error('Profile Load Error:', e);
        
        const isConnectivityError = e?.message?.includes('offline') || e?.code === 'unavailable' || e?.message === 'timeout' || e?.code === 'deadline-exceeded';
        
        if (isConnectivityError && retryCount < 2) {
          console.log('Connectivity issue detected, retrying (attempt ' + (retryCount + 2) + ')...');
          setTimeout(() => fetchProfile(retryCount + 1), 2000);
          return;
        }

        let errorMsg = 'Não foi possível carregar seu perfil.';
        if (e?.code === 'permission-denied') {
          errorMsg = 'Acesso Negado: Você não tem permissão para acessar este perfil. Verifique as regras do banco de dados.';
        } else if (isConnectivityError) {
          errorMsg = 'Falha de Conexão: O servidor do banco de dados está inacessível. Isso pode ser um problema temporário ou bloqueio de rede.';
        } else if (e?.message) {
          errorMsg = `Erro: ${e.message}`;
        }
        
        setError(errorMsg);
        setLoading(false);
      }
    };

    fetchProfile();
  };

  const isPartner = profile?.role === UserRole.PARTNER;

  const SidebarContent = () => (
    <>
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white p-2 rounded-lg text-black">
            <Zap className="w-5 h-5" />
          </div>
          <span className="text-white font-bold tracking-tight">Influency Club</span>
        </div>
        <button 
          onClick={() => setMobileMenuOpen(false)}
          className="p-2 hover:bg-[#1a1a1a] rounded-lg md:hidden text-gray-500"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {viewMode === ViewMode.COMPANY && (
        <div className="px-6 py-4 border-b border-[#222] bg-orange-500/5">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${isPartner ? 'bg-yellow-500' : 'bg-green-500'}`} />
            <span className="text-[10px] font-black uppercase text-white tracking-widest leading-none">
              {isPartner ? 'Sócio' : 'Colaborador'}
            </span>
          </div>
          <p className="text-[10px] text-gray-500 font-medium">Camada Empresa Ativa</p>
        </div>
      )}

      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto no-scrollbar">
        {tabs.map((tab) => (
          <div key={tab.id} className="space-y-1">
            <button
              onClick={() => {
                if (tab.id === 'accounts') {
                  setAccountsExpanded(!accountsExpanded);
                } else if (tab.id === 'products') {
                  setProductsExpanded(!productsExpanded);
                } else if (tab.id === 'production') {
                  if (isPartner) {
                    setProductionExpanded(!productionExpanded);
                  } else {
                    setActiveTab('production_line');
                    setMobileMenuOpen(false);
                  }
                } else {
                  setActiveTab(tab.id);
                  setMobileMenuOpen(false);
                }
              }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
                (activeTab === tab.id || (tab.subItems && (activeTab.startsWith(tab.id + '_'))) || (!isPartner && tab.id === 'production' && activeTab === 'production_line'))
                  ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' 
                  : 'hover:bg-[#1a1a1a] text-gray-500 hover:text-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <tab.icon className="w-5 h-5" />
                <span className="font-medium text-sm">{tab.label}</span>
                {!!(tab as any).badgeCount && (
                  <span className="ml-[6px] px-1.5 py-0.5 rounded-full bg-[#f97316] text-black text-[9px] font-black leading-none font-mono">
                    {(tab as any).badgeCount}
                  </span>
                )}
              </div>
              {tab.subItems && (
                (tab.id === 'accounts' ? accountsExpanded : tab.id === 'products' ? productsExpanded : productionExpanded) 
                  ? <ChevronUp className="w-4 h-4" /> 
                  : <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {tab.subItems && (tab.id === 'accounts' ? accountsExpanded : tab.id === 'products' ? productsExpanded : productionExpanded) && (
              <div className="pl-12 space-y-1">
                {tab.subItems.map(subItem => (
                  <button
                    key={subItem.id}
                    onClick={() => {
                      setActiveTab(subItem.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full text-left py-2 px-4 rounded-lg text-sm transition-colors ${
                      activeTab === subItem.id 
                        ? 'text-orange-500 font-bold bg-orange-500/5' 
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {subItem.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-[#222]">
        <div className="flex items-center gap-3 p-3 bg-[#141414] rounded-xl border border-[#222]">
          <img src={user.photoURL || ''} className="w-8 h-8 rounded-full" alt="User" referrerPolicy="no-referrer" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate flex items-center gap-1">
              {user.displayName}
              {isPartner && <Zap className="w-3 h-3 text-yellow-500" />}
            </p>
            <p className="text-xs text-gray-500 truncate flex items-center gap-1">
              {user.email}
            </p>
          </div>
          <button onClick={() => signOut(auth)} className="hover:text-red-500 transition-colors shrink-0">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );

  const ProtectedValue = ({ value, prefix = "", suffix = "", className = "" }: { value: string | number, prefix?: string, suffix?: string, className?: string }) => {
    // Financial values are only shown if Personal mode OR Company mode with Partner role
    const canSeeFinancials = viewMode === ViewMode.PERSONAL || (viewMode === ViewMode.COMPANY && isPartner);
    
    if (!canSeeFinancials) {
      return <span className={`font-mono blur-[4px] select-none ${className}`}>{prefix}***{suffix}</span>;
    }
    return <span className={className}>{prefix}{value}{suffix}</span>;
  };

  // Sync Data
  useEffect(() => {
    if (!user || !viewMode) return;

    // Scoping Logic: 
    // PERSONAL: scope == 'PERSONAL' AND userId == user.uid
    // COMPANY: scope == 'COMPANY'
    const isCompany = viewMode === ViewMode.COMPANY;
    
    // Helper to create scoped queries
    const createScopedQuery = (collectionName: string) => {
      const collRef = collection(db, collectionName);
      if (isCompany) {
        return query(collRef, where('scope', '==', 'COMPANY'));
      } else {
        return query(collRef, where('scope', '==', 'PERSONAL'), where('userId', '==', user.uid));
      }
    };

    const unsubAccounts = onSnapshot(createScopedQuery('accounts'), (snapshot) => {
      setAccounts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Account)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'accounts'));

    const unsubProducts = onSnapshot(createScopedQuery('products'), (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'products'));

    const unsubSchedule = onSnapshot(createScopedQuery('schedule'), (snapshot) => {
      setSchedule(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ScheduleItem)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'schedule'));

    const unsubViolations = onSnapshot(createScopedQuery('violations'), (snapshot) => {
      setViolations(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Violation)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'violations'));

    const unsubSales = onSnapshot(createScopedQuery('sales'), (snapshot) => {
      setSales(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'sales'));

    const unsubProducers = onSnapshot(createScopedQuery('producers'), (snapshot) => {
      let data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Producer));
      
      // Seed initial producers if it's COMPANY mode and empty
      if (isCompany && data.length === 0) {
        const initialSuppliers = ['Gabi', 'Guilherme', 'Vitor', 'Davi'];
        initialSuppliers.forEach(async name => {
          await addDoc(collection(db, 'producers'), {
            name,
            userId: user.uid,
            scope: 'COMPANY',
            role: 'supplier',
            createdAt: serverTimestamp()
          });
        });
      }
      
      // Auto-link logged-in user if matched by email but not yet linked by user ID
      if (user) {
        const explicitUserLink = data.find(p => getProducerLinkedUserId(p) === user.uid);
        const unmatchedButEmailed = !explicitUserLink
          ? data.filter(p =>
              !getProducerLinkedUserId(p) &&
              getProducerLinkedEmail(p)?.toLowerCase() === user.email?.toLowerCase()
            )
          : [];
        if (unmatchedButEmailed.length === 1) {
          const producerToLink = unmatchedButEmailed[0];
          const targetRole = getProducerLinkedRole(producerToLink) || 'editor';
          updateDoc(doc(db, 'producers', producerToLink.id), {
            linkedUserId: user.uid,
            collaboratorUserId: user.uid,
            editorUserId: targetRole === 'editor' ? user.uid : null,
            supplierUserId: targetRole === 'supplier' ? user.uid : null,
            role: targetRole,
            updatedAt: serverTimestamp()
          }).catch(err => console.error('Error auto-linking producer:', err));
        } else if (unmatchedButEmailed.length > 1) {
          console.warn('Auto-link skipped because the same email is present in multiple collaborators:', user.email);
        }
      }
      
      setProducers(data);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'producers'));

    let unsubProfiles = () => {};
    if (isCompany) {
      const qProfiles = query(collection(db, 'user_profiles'), where('viewMode', '==', 'COMPANY'));
      unsubProfiles = onSnapshot(qProfiles, (snapshot) => {
        setUserProfiles(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile)));
      }, (err) => handleFirestoreError(err, OperationType.GET, 'user_profiles'));
    }

    const todayStr = getLocalDateString();
    const qCompleted = isCompany
      ? query(collection(db, 'completed_suggestions'), where('scope', '==', 'COMPANY'), where('date', '==', todayStr))
      : query(collection(db, 'completed_suggestions'), where('scope', '==', 'PERSONAL'), where('userId', '==', user.uid), where('date', '==', todayStr));

    const unsubCompleted = onSnapshot(qCompleted, (snapshot) => {
      setCompletedSuggestions(new Set(snapshot.docs.map(d => d.data().key)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'completed_suggestions'));

    const unsubTiktokLinks = onSnapshot(createScopedQuery('tiktok_links'), (snapshot) => {
      setTiktokLinks(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TiktokLink)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'tiktok_links'));

    return () => {
      unsubAccounts();
      unsubProducts();
      unsubSchedule();
      unsubViolations();
      unsubSales();
      unsubProducers();
      unsubCompleted();
      unsubTiktokLinks();
    };
  }, [user, viewMode]);

  // Registrador Automático de Produtos Salvos (Background Automático)
  useEffect(() => {
    if (!user || accounts.length === 0) return;
    
    accounts.forEach(async (acc) => {
      // Sincroniza apenas se o registrador automático estiver ativo na conta
      if ((acc as any).autoRegisterSaved) {
        const cacheKey = `${acc.id}_${(acc as any).tiktokAccessToken || ''}`;
        if (checkedAccountsRef.current.has(cacheKey)) return;
        
        checkedAccountsRef.current.add(cacheKey);
        console.log(`[Registrador Automático] Verificando produtos salvos na conta do afiliado: ${acc.name}`);
        
        try {
          const isSimulating = !(acc as any).tiktokAccessToken;
          const url = `/api/tiktok/sync-saved?access_token=${(acc as any).tiktokAccessToken || ''}&simulate=${isSimulating ? 'true' : 'false'}`;
          const resp = await fetch(url);
          const data = await resp.json();
          
          if (data.error) {
            console.error(`[Registrador Automático] Erro ao sincronizar:`, data.error);
            return;
          }
          
          const incomingProducts = data.products || [];
          if (incomingProducts.length === 0) return;
          
          const existingProductNames = new Set(
            products.map(p => p.name.toLowerCase().trim())
          );
          
          let newlyImported = 0;
          for (const item of incomingProducts) {
            const titleNormalized = item.title.trim();
            if (existingProductNames.has(titleNormalized.toLowerCase())) {
              continue;
            }
            
            const price = parseFloat(item.price?.min_price || "0");
            const commissionVal = parseFloat(item.commission_info?.commission_value || "0");
            
            await addDoc(collection(db, 'products'), {
              name: item.title,
              category: item.category || 'Produtos Salvos',
              winningStatus: WinningStatus.TESTING,
              price: price,
              commissionValue: commissionVal,
              imageUrl: item.cover_image || '',
              productUrl: item.product_url || '',
              externalProductId: item.product_id,
              userId: user.uid,
              scope: viewMode === ViewMode.COMPANY ? 'COMPANY' : 'PERSONAL',
              createdAt: new Date().toISOString(),
              autoRegistered: true,
              originAccountId: acc.id
            });
            
            existingProductNames.add(titleNormalized.toLowerCase());
            newlyImported++;
          }
          
          if (newlyImported > 0) {
            console.log(`[Registrador Automático] ${newlyImported} novos produtos adicionados automaticamente da conta ${acc.name}!`);
          }
        } catch (error) {
          console.error(`[Registrador Automático] Erro inesperado:`, error);
        }
      }
    });
  }, [user, accounts, products, viewMode]);

  // Automatic Phase Transition Logic
  useEffect(() => {
    if (!user || products.length === 0 || sales.length === 0) return;

    const now = new Date();
    
    // Thresholds:
    // Testing: 0 sales
    // Potential (Saindo do teste): 200 comm in 10 days
    // Winner (Validação): 700+ comm in 7 days
    // Scaled (Escala): 8000+ comm in 30 days

    products.forEach(async (product) => {
      const productSales = sales.filter(s => s.productId === product.id);
      
      const last7DaysComm = productSales
        .filter(s => (now.getTime() - new Date(s.date).getTime()) <= 7 * 24 * 60 * 60 * 1000)
        .reduce((sum, s) => sum + s.commission, 0);

      const last10DaysComm = productSales
        .filter(s => (now.getTime() - new Date(s.date).getTime()) <= 10 * 24 * 60 * 60 * 1000)
        .reduce((sum, s) => sum + s.commission, 0);

      const last30DaysComm = productSales
        .filter(s => (now.getTime() - new Date(s.date).getTime()) <= 30 * 24 * 60 * 60 * 1000)
        .reduce((sum, s) => sum + s.commission, 0);

      let calculatedStatus = WinningStatus.TESTING;
      if (last30DaysComm >= 8000) calculatedStatus = WinningStatus.SCALED;
      else if (last7DaysComm >= 700) calculatedStatus = WinningStatus.WINNER;
      else if (last10DaysComm >= 200) calculatedStatus = WinningStatus.POTENTIAL;

      if (product.winningStatus !== calculatedStatus) {
        try {
          await updateDoc(doc(db, 'products', product.id), { winningStatus: calculatedStatus });
        } catch (e) {
          console.error("Error updating product status", e);
        }
      }
    });
  }, [sales, products, user, viewMode]);

  const getReplicationSuggestions = () => {
    const now = new Date();
    const todayStr = getLocalDateString(now);
    const currentSlot = Math.floor((now.getHours() * 60 + now.getMinutes()) / 30); // 0-47

    const suggestions: { accountId: string, productId: string, phase: WinningStatus, count: number }[] = [];
    const suggestedKeys = new Set<string>();

    const isVisible = (key: string, phase: WinningStatus) => {
      if (completedSuggestions.has(key)) return false;
      if (phase === WinningStatus.SCALED || phase === WinningStatus.WINNER) return true;
      
      // Testing and Potential: 5 random slots of 30min
      const seedStr = todayStr + key;
      let hash = 0;
      for (let i = 0; i < seedStr.length; i++) {
        hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
        hash |= 0;
      }
      
      const slots: number[] = [];
      let tempSeed = Math.abs(hash);
      while (slots.length < 5) {
        tempSeed = (tempSeed * 16807) % 2147483647;
        const slot = tempSeed % 48;
        if (!slots.includes(slot)) slots.push(slot);
      }
      
      return slots.includes(currentSlot);
    };

    // 1. Suggestions based on Linked Products (even if 0 sales)
    accounts.forEach(acc => {
      (acc.linkedProductIds || []).forEach(prodId => {
        const prod = products.find(p => p.id === prodId);
        if (!prod) return;
        
        const key = `${acc.id}_${prodId}`;
        if (!isVisible(key, prod.winningStatus)) return;

        let count = 3; // Default for Testing and Potential (Saindo do teste)
        if (prod.winningStatus === WinningStatus.SCALED) count = 2;
        else if (prod.winningStatus === WinningStatus.WINNER) count = 4; // Validação: 2-4 (using 4)
        
        suggestions.push({ accountId: acc.id, productId: prodId, phase: prod.winningStatus, count });
        suggestedKeys.add(key);
      });
    });

    // 2. Suggestions based on Recent Sales (even if not linked)
    sales.forEach(s => {
      const key = `${s.accountId}_${s.productId}`;
      if (suggestedKeys.has(key)) return;
      
      const prod = products.find(p => p.id === s.productId);
      if (!prod) return;

      if (!isVisible(key, prod.winningStatus)) return;

      const diffDays = (now.getTime() - new Date(s.date).getTime()) / (24 * 60 * 60 * 1000);
      if (diffDays <= 30) {
        let count = 3;
        if (prod.winningStatus === WinningStatus.SCALED) count = 2;
        else if (prod.winningStatus === WinningStatus.WINNER) count = 4;

        suggestions.push({ accountId: s.accountId, productId: s.productId, phase: prod.winningStatus, count });
        suggestedKeys.add(key);
      }
    });

    return suggestions.sort((a,b) => {
      const order = { [WinningStatus.SCALED]: 0, [WinningStatus.WINNER]: 1, [WinningStatus.POTENTIAL]: 2, [WinningStatus.TESTING]: 3 };
      return order[a.phase] - (order[b.phase] || 0);
    });
  };

  const markSuggestionAsCompleted = async (accountId: string, productId: string) => {
    if (!user) return;
    const key = `${accountId}_${productId}`;
    const todayStr = getLocalDateString();
    try {
      await addDoc(collection(db, 'completed_suggestions'), {
        userId: user.uid,
        key,
        date: todayStr,
        scope: viewMode === ViewMode.COMPANY ? 'COMPANY' : 'PERSONAL'
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'completed_suggestions');
    }
  };

  const publicCompliancePage = getCompliancePage(window.location.pathname);
  if (publicCompliancePage) return <CompliancePage page={publicCompliancePage} />;

  if (error) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#141414] border border-red-500/20 p-8 rounded-2xl text-center space-y-6">
        <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto">
          <AlertTriangle className="text-red-500 w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Ops! Algo deu errado</h2>
          <p className="text-gray-400 text-sm">{error}</p>
        </div>
        <div className="space-y-4">
          <button 
            onClick={() => selectAccessMode(selectedMode!)}
            className="w-full bg-white text-black font-bold py-3 px-6 rounded-xl hover:bg-gray-200 transition-colors"
          >
            Tentar Novamente
          </button>
          <button 
            onClick={() => { setError(null); setSelectedMode(null); setViewMode(null); }}
            className="w-full bg-[#1a1a1a] text-white font-bold py-3 px-6 rounded-xl hover:bg-[#222] transition-colors border border-[#222]"
          >
            Voltar para Início
          </button>
        </div>
      </div>
    </div>
  );

  if (!authChecked || (loading && !selectedMode)) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full"
      />
    </div>
  );

  if (!selectedMode) return <LayerSelection onSelect={setSelectedMode} userEmail={user?.email || null} />;
  
  if (!user) return <Login onBack={() => setSelectedMode(null)} onLoginSuccess={(token) => setDriveAccessToken(token)} />;

  if (loading || !viewMode) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center space-y-6 flex-col">
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full"
      />
      <div className="text-center space-y-4">
        <div className="space-y-2">
          <p className="text-gray-500 font-bold animate-pulse text-sm">Carregando seu espaço...</p>
          <p className="text-[10px] text-gray-400 font-mono">Conectando ao Firestore...</p>
          <p className="text-[10px] text-gray-700 uppercase tracking-widest">{selectedMode === ViewMode.COMPANY ? 'Empresa' : 'Pessoal'}</p>
        </div>
        
        <div className="flex flex-col gap-2">
          <button 
            onClick={() => selectAccessMode(selectedMode!)}
            className="text-[10px] text-orange-500 hover:text-orange-400 font-bold uppercase tracking-wider transition-colors"
          >
            FORÇAR RECONECTAR
          </button>
          <button 
            onClick={() => { setSelectedMode(null); setLoading(false); setError(null); }}
            className="text-[10px] text-gray-600 hover:text-gray-400 font-bold uppercase tracking-wider transition-colors"
          >
            CANCELAR E VOLTAR
          </button>
        </div>
      </div>
    </div>
  );

  const getFilteredSales = () => {
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date(now);

    if (salesTimeWindow === 'today') {
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (salesTimeWindow === 'yesterday') {
      startDate.setDate(now.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
    } else if (salesTimeWindow === '7') {
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (salesTimeWindow === '30') {
      startDate.setDate(now.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (salesTimeWindow === '90') {
      startDate.setDate(now.getDate() - 90);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (salesTimeWindow === 'custom' && customDateRange.start) {
      startDate = new Date(customDateRange.start);
      startDate.setHours(0, 0, 0, 0);
      if (customDateRange.end) {
        endDate = new Date(customDateRange.end);
        endDate.setHours(23, 59, 59, 999);
      } else {
        endDate.setHours(23, 59, 59, 999);
      }
    } else {
      startDate.setDate(now.getDate() - 30); // Default 30
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    }

    return sales.filter(s => {
      const saleDate = new Date(s.date);
      // Sale dates are stored as ISO strings (YYYY-MM-DD), so they default to UTC midnight.
      // To compare correctly with local dates, we should normalize both or compare strings.
      // Given the logic here uses local dates, let's ensure we compare the date parts.
      return saleDate >= startDate && saleDate <= endDate;
    });
  };

  const dashboardSales = getFilteredSales();
  const totalGMV = dashboardSales.reduce((sum, s) => sum + s.gmv, 0);
  const totalCommission = dashboardSales.reduce((sum, s) => sum + s.commission, 0);

  const topProductsData = products.map(p => {
    const pSales = dashboardSales.filter(s => s.productId === p.id);
    return {
      ...p,
      totalRevenue: pSales.reduce((sum, s) => sum + s.gmv, 0),
      totalComm: pSales.reduce((sum, s) => sum + s.commission, 0),
      totalQty: pSales.reduce((sum, s) => sum + s.quantity, 0)
    };
  }).filter(p => p.totalRevenue > 0).sort((a, b) => b.totalRevenue - a.totalRevenue);

  const topAccountsData = accounts.map(a => {
    const aSales = dashboardSales.filter(s => s.accountId === a.id);
    return {
      ...a,
      totalRevenue: aSales.reduce((sum, s) => sum + s.gmv, 0),
      totalComm: aSales.reduce((sum, s) => sum + s.commission, 0),
      totalQty: aSales.reduce((sum, s) => sum + s.quantity, 0)
    };
  }).filter(a => a.totalRevenue > 0).sort((a, b) => b.totalRevenue - a.totalRevenue);

  const readyVideosCount = schedule.filter(s => s.status === ScheduleStatus.PRODUCED || s.status === ScheduleStatus.POSTED).length;

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ...(userRole === 'editor' || userRole === 'supplier' ? [] : [{ id: 'planner', label: 'Planejador', icon: Calendar }]),
    ...(userRole === 'supplier' ? [{ id: 'planner', label: 'Gemini', icon: Sparkles }] : []),
    ...(isPartner ? [
      { id: 'ready_videos', label: 'Publicações', icon: FileVideo, badgeCount: readyVideosCount },
      { id: 'creators', label: 'Criadores', icon: UsersIcon }
    ] : []),
    ...(userRole === 'editor' || userRole === 'supplier' || (viewMode === ViewMode.COMPANY) ? [{ 
      id: 'production', 
      label: 'Produção', 
      icon: Video,
      subItems: isPartner ? [
        { id: 'production_editors', label: 'Editores' },
        { id: 'production_suppliers', label: 'Fornecedores' },
        { id: 'production_line', label: 'Esteira de Produção' },
        { id: 'production_library', label: 'Gerenciar Conteúdo' }
      ] : undefined
    }] : []),
    { 
      id: 'accounts', 
      label: 'Contas', 
      icon: Layers,
      subItems: [
        { id: 'accounts_new', label: 'Registrar Nova' },
        { id: 'accounts_edit', label: 'Editar Contas' }
      ]
    },
    { 
      id: 'products', 
      label: 'Produtos', 
      icon: Hash,
      subItems: [
        { id: 'products_new', label: 'Registrar Novo' },
        { id: 'products_edit', label: 'Editar Produtos' }
      ]
    },
    ...(isPartner || viewMode === ViewMode.PERSONAL ? [{ id: 'sales', label: 'Registrar Vendas', icon: BarChart3 }] : []),
    { id: 'violations', label: 'Violações', icon: AlertTriangle },
    { id: 'integrations', label: 'Integrações', icon: Zap },
    ...(viewMode === ViewMode.COMPANY && isPartner ? [{ id: 'users', label: 'Usuários', icon: UsersIcon }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-300 flex overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99] md:hidden"
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-72 bg-[#0c0c0c] border-r border-[#222] z-[100] flex flex-col md:hidden"
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className="w-64 border-r border-[#222] bg-[#0c0c0c] flex flex-col hidden md:flex sticky top-0 h-screen shrink-0">
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto w-full h-screen">
        <header className="min-h-16 border-b border-[#222] flex items-center justify-between gap-3 px-3 py-2 md:px-8 md:py-0 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 hover:bg-[#1a1a1a] rounded-lg transition-colors md:hidden text-white"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-sm sm:text-lg font-semibold text-white capitalize truncate">
              {activeTab === 'planner' && userRole === 'supplier' ? 'Gemini' : activeTab.replace('_', ' ')}
            </h2>
          </div>
          <div className="flex items-center justify-end gap-2 md:gap-4 shrink-0">
            {!driveConfigured && isPartner && (
              <button 
                className="bg-orange-600 hover:bg-orange-700 text-white px-2.5 md:px-3 py-2 md:py-1.5 rounded-lg text-[10px] md:text-xs font-bold transition-all shadow-lg shadow-orange-900/20 active:scale-95 flex items-center gap-2"
                onClick={async () => {
                  const res = await fetch(`/api/drive/auth-url`);
                  const data = await res.json();
                  window.location.href = data.url;
                }}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Configurar Drive Global</span>
                <span className="sm:hidden">Drive</span>
              </button>
            )}
            <button className="p-2 hover:bg-[#1a1a1a] rounded-lg transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && (
                <div className="space-y-8">
                  {isPartner && readyVideosCount > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => setActiveTab('ready_videos')}
                      className="cursor-pointer bg-gradient-to-r from-orange-500/20 to-amber-500/10 border border-orange-500/20 p-5 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group transition-all duration-300 hover:border-orange-500/40 hover:from-orange-500/25 hover:shadow-lg hover:shadow-orange-500/5"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center text-black font-black flex-shrink-0 animate-pulse">
                          <FileVideo className="w-6 h-6" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-white font-black text-sm uppercase tracking-wider">Você tem {readyVideosCount} {readyVideosCount === 1 ? 'publicação' : 'publicações'} para revisar!</h4>
                          <p className="text-gray-400 text-xs">Os editores já subiram novos materiais prontos. Baixe e gerencie agora diretamente pelo app sem redirecionamentos para o Drive.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-orange-500 text-black font-bold uppercase tracking-wider text-[10px] px-4 py-2.5 rounded-xl group-hover:bg-orange-400 transition-colors">
                        Ver Publicações
                        <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                      </div>
                    </motion.div>
                  )}
                  {/* Sales Summary - Only for Partners or Personal */}
                  {(isPartner || viewMode === ViewMode.PERSONAL) && (
                    <div className="space-y-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <h3 className="text-white font-bold flex items-center gap-2 text-xl tracking-tight">
                            <BarChart3 className="w-6 h-6 text-orange-500" />
                            Resumo de Vendas
                          </h3>
                          <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest font-black">Performance Financeira</p>
                        </div>
                        
                        <div className="relative">
                          <button 
                            onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)}
                            className="flex items-center gap-2 px-4 py-2 bg-[#141414] border border-[#222] rounded-xl text-xs font-bold text-gray-300 hover:text-white transition-colors"
                          >
                            <span className="text-gray-500 uppercase tracking-widest text-[10px]">Intervalo:</span>
                            {
                              {
                                'today': 'Hoje',
                                'yesterday': 'Ontem',
                                '7': '7D',
                                '30': '30D',
                                '90': '90D',
                                'custom': 'Personalizado'
                              }[salesTimeWindow]
                            }
                            <ChevronDown className={`w-3 h-3 transition-transform ${isDateDropdownOpen ? 'rotate-180' : ''}`} />
                          </button>

                          <AnimatePresence>
                            {isDateDropdownOpen && (
                              <>
                                <div className="fixed inset-0 z-20" onClick={() => setIsDateDropdownOpen(false)} />
                                <motion.div 
                                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                  className="absolute right-0 mt-2 w-48 bg-[#141414] border border-[#222] rounded-2xl shadow-2xl z-30 overflow-hidden"
                                >
                                  {[
                                    { id: 'today', label: 'Hoje' },
                                    { id: 'yesterday', label: 'Ontem' },
                                    { id: '7', label: '7D' },
                                    { id: '30', label: '30D' },
                                    { id: '90', label: '90D' },
                                    { id: 'custom', label: 'Personalizado' }
                                  ].map(opt => (
                                    <button
                                      key={opt.id}
                                      onClick={() => {
                                        setSalesTimeWindow(opt.id as any);
                                        setIsDateDropdownOpen(false);
                                      }}
                                      className={`w-full text-left px-4 py-3 text-xs font-bold transition-colors hover:bg-[#1a1a1a] ${
                                        salesTimeWindow === opt.id 
                                          ? 'text-orange-500 bg-orange-500/5' 
                                          : 'text-gray-500'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </motion.div>
                              </>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                      {salesTimeWindow === 'custom' && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="flex items-center gap-4 p-4 bg-[#141414] border border-[#222] rounded-2xl"
                        >
                          <div className="flex-1 space-y-1">
                            <label className="text-[10px] font-black uppercase text-gray-500">Início</label>
                            <input 
                              type="date" 
                              value={customDateRange.start}
                              onChange={(e) => setCustomDateRange(prev => ({...prev, start: e.target.value}))}
                              className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg p-2 text-sm text-white outline-none focus:border-orange-500"
                            />
                          </div>
                          <div className="flex-1 space-y-1">
                            <label className="text-[10px] font-black uppercase text-gray-500">Fim</label>
                            <input 
                              type="date" 
                              value={customDateRange.end}
                              onChange={(e) => setCustomDateRange(prev => ({...prev, end: e.target.value}))}
                              className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg p-2 text-sm text-white outline-none focus:border-orange-500"
                            />
                          </div>
                        </motion.div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-6 bg-[#141414] border border-[#222] rounded-3xl relative overflow-hidden group">
                           <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-orange-500/5 rounded-full blur-2xl group-hover:bg-orange-500/10 transition-all" />
                           <DollarSign className="w-5 h-5 text-orange-500 mb-4" />
                           <p className="text-xs font-black uppercase text-gray-500 tracking-widest mb-1">GMV Total</p>
                           <h4 className="text-2xl font-black text-white tracking-tighter">
                             <ProtectedValue 
                                value={totalGMV.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} 
                                prefix="R$ " 
                                className="text-white"
                             />
                           </h4>
                        </div>

                        <div className="p-6 bg-[#141414] border border-[#222] rounded-3xl relative overflow-hidden group">
                           <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-green-500/5 rounded-full blur-2xl group-hover:bg-green-500/10 transition-all" />
                           <TrendingUp className="w-5 h-5 text-green-500 mb-4" />
                           <p className="text-xs font-black uppercase text-gray-500 tracking-widest mb-1">Comissão Realizada</p>
                           <h4 className="text-2xl font-black text-white tracking-tighter">
                             <ProtectedValue 
                                value={totalCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} 
                                prefix="R$ " 
                                className="text-green-500"
                             />
                           </h4>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Top 3 Products */}
                        <div className="bg-[#141414] border border-[#222] rounded-[2rem] p-6 space-y-6">
                          <div className="flex items-center justify-between">
                            <h4 className="text-white font-bold text-lg">Top Produtos Performance</h4>
                            <button 
                              onClick={() => setShowAllTopProducts(!showAllTopProducts)}
                              className="text-orange-500 text-xs font-black uppercase tracking-widest hover:underline"
                            >
                              {showAllTopProducts ? 'Recolher' : 'Ver Todos'}
                            </button>
                          </div>
                          
                          <div className="space-y-4">
                            {(showAllTopProducts ? topProductsData : topProductsData.slice(0, 3)).map((p, idx) => (
                              <div key={p.id} className="flex items-center gap-4 group">
                                <div className="w-10 h-10 bg-[#0a0a0a] rounded-xl flex items-center justify-center border border-[#222] font-black text-xs text-orange-500">
                                  #{idx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-sm font-bold text-white truncate">{p.name}</p>
                                    <p className="text-xs font-mono text-gray-500">{p.totalQty} vendas</p>
                                  </div>
                                  <div className="w-full h-1.5 bg-[#0a0a0a] rounded-full overflow-hidden">
                                    <motion.div 
                                      initial={{ width: 0 }}
                                      animate={{ width: `${(p.totalRevenue / (topProductsData[0]?.totalRevenue || 1)) * 100}%` }}
                                      className="h-full bg-orange-500 rounded-full"
                                    />
                                  </div>
                                  <div className="flex items-center justify-between mt-1.5">
                                    <ProtectedValue 
                                      value={p.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} 
                                      prefix="R$ " 
                                      className="text-[10px] font-black text-white/50"
                                    />
                                    <ProtectedValue 
                                      value={p.totalComm.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} 
                                      prefix="Com: R$ " 
                                      className="text-[10px] font-bold text-green-500"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                            {topProductsData.length === 0 && (
                              <p className="text-center py-8 text-gray-600 italic text-sm">Nenhum dado de venda no período</p>
                            )}
                          </div>
                        </div>

                        {/* Top 3 Accounts */}
                        <div className="bg-[#141414] border border-[#222] rounded-[2rem] p-6 space-y-6">
                          <div className="flex items-center justify-between">
                            <h4 className="text-white font-bold text-lg">Top Contas Performance</h4>
                            <button 
                              onClick={() => setShowAllTopAccounts(!showAllTopAccounts)}
                              className="text-orange-500 text-xs font-black uppercase tracking-widest hover:underline"
                            >
                              {showAllTopAccounts ? 'Recolher' : 'Ver Todas'}
                            </button>
                          </div>
                          
                          <div className="space-y-4">
                            {(showAllTopAccounts ? topAccountsData : topAccountsData.slice(0, 3)).map((a, idx) => (
                              <div key={a.id} className="flex items-center gap-4 group">
                                <div className="w-10 h-10 bg-[#0a0a0a] rounded-xl flex items-center justify-center border border-[#222] font-black text-xs text-blue-500">
                                  #{idx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-sm font-bold text-white truncate">{a.name}</p>
                                    <p className="text-xs font-mono text-gray-500">{a.totalQty} vendas</p>
                                  </div>
                                  <div className="w-full h-1.5 bg-[#0a0a0a] rounded-full overflow-hidden">
                                    <motion.div 
                                      initial={{ width: 0 }}
                                      animate={{ width: `${(a.totalRevenue / (topAccountsData[0]?.totalRevenue || 1)) * 100}%` }}
                                      className="h-full bg-blue-500 rounded-full"
                                    />
                                  </div>
                                  <div className="flex items-center justify-between mt-1.5">
                                    <ProtectedValue 
                                      value={a.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} 
                                      prefix="R$ " 
                                      className="text-[10px] font-black text-white/50"
                                    />
                                    <ProtectedValue 
                                      value={a.totalComm.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} 
                                      prefix="Com: R$ " 
                                      className="text-[10px] font-bold text-green-500"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                            {topAccountsData.length === 0 && (
                              <p className="text-center py-8 text-gray-600 italic text-sm">Nenhum dado de venda no período</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Operations Summary - For Editors and Suppliers */}
                  {!isPartner && viewMode === ViewMode.COMPANY && (userRole === 'supplier' || userRole === 'editor') && linkedProducer && (() => {
                    const editorItems = schedule.filter(s => s.producerId === linkedProducer.id);
                    const materiaisFornecidos = editorItems.filter(s => (s.audioMaterial && s.audioMaterial.length > 0) || (s.videoMaterial && s.videoMaterial.length > 0)).length;
                    const videosEditados = editorItems.filter(s => (s.finishedVideoUrl && s.finishedVideoUrl.length > 0) || s.status === ScheduleStatus.PRODUCED || s.status === ScheduleStatus.POSTED).length;
                    const editorPendentes = Math.max(0, materiaisFornecidos - videosEditados);

                    const supplierItems = supplierDashboardSchedule;
                    const supplierActionItems = supplierItems.filter(s => needsSupplierDashboardAction(s, linkedProducer.id));
                    const preparados = supplierItems.filter(s => hasSupplierPreparedMaterial(s) || s.status !== ScheduleStatus.PLANNED).length;
                    const aPreparar = supplierActionItems.length;
                    const supplierPendentes = supplierActionItems.length;

                    return (
                      <div className="space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div>
                            <h3 className="text-white font-bold flex items-center gap-2 text-xl tracking-tight">
                              <Layers className="w-6 h-6 text-orange-500" />
                              {userRole === 'supplier' ? 'Resumo de Preparo' : 'Resumo de Edições'}
                            </h3>
                            <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest font-black">Performance Operacional - {linkedProducer.name}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {userRole === 'supplier' ? (
                            <>
                              {/* Card 1: Preparados */}
                              <div className="p-6 bg-[#141414] border border-[#222] rounded-3xl relative overflow-hidden group">
                                <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-[#0ef]/5 rounded-full blur-2xl group-hover:bg-[#0ef]/10 transition-all" />
                                <TrendingUp className="w-5 h-5 text-[#0ef] mb-4" />
                                <p className="text-xs font-black uppercase text-gray-500 tracking-widest mb-1">Preparados</p>
                                <h4 className="text-2xl font-black text-white tracking-tighter">
                                  {preparados} itens
                                </h4>
                              </div>

                              {/* Card 2: A preparar */}
                              <div className="p-6 bg-[#141414] border border-[#222] rounded-3xl relative overflow-hidden group">
                                <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-orange-500/5 rounded-full blur-2xl group-hover:bg-orange-500/10 transition-all" />
                                <Clock className="w-5 h-5 text-orange-500 mb-4" />
                                <p className="text-xs font-black uppercase text-gray-500 tracking-widest mb-1">A preparar</p>
                                <h4 className="text-2xl font-black text-white tracking-tighter">
                                  {aPreparar} tarefas
                                </h4>
                              </div>

                              {/* Card 3: Pendente */}
                              <div className="p-6 bg-[#141414] border border-[#222] rounded-3xl relative overflow-hidden group">
                                <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-red-500/5 rounded-full blur-2xl group-hover:bg-red-500/10 transition-all" />
                                <CheckCircle2 className="w-5 h-5 text-red-500 mb-4" />
                                <p className="text-xs font-black uppercase text-gray-500 tracking-widest mb-1">Pendente</p>
                                <h4 className="text-2xl font-black text-white tracking-tighter">
                                  {supplierPendentes} pendentes
                                </h4>
                              </div>
                            </>
                          ) : (
                            <>
                              {/* Card 1: Materiais Fornecidos */}
                              <div className="p-6 bg-[#141414] border border-[#222] rounded-3xl relative overflow-hidden group">
                                <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-[#0ef]/5 rounded-full blur-2xl group-hover:bg-[#0ef]/10 transition-all" />
                                <Layers className="w-5 h-5 text-[#0ef] mb-4" />
                                <p className="text-xs font-black uppercase text-gray-500 tracking-widest mb-1">Materiais Fornecidos</p>
                                <h4 className="text-2xl font-black text-white tracking-tighter">
                                  {materiaisFornecidos} itens
                                </h4>
                              </div>

                              {/* Card 2: Vídeos Editados */}
                              <div className="p-6 bg-[#141414] border border-[#222] rounded-3xl relative overflow-hidden group">
                                <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-all" />
                                <Video className="w-5 h-5 text-blue-500 mb-4" />
                                <p className="text-xs font-black uppercase text-gray-500 tracking-widest mb-1">Vídeos Editados</p>
                                <h4 className="text-2xl font-black text-white tracking-tighter">
                                  {videosEditados} concluídos
                                </h4>
                              </div>

                              {/* Card 3: Pendentes */}
                              <div className="p-6 bg-[#141414] border border-[#222] rounded-3xl relative overflow-hidden group">
                                <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-orange-500/5 rounded-full blur-2xl group-hover:bg-orange-500/10 transition-all" />
                                <Clock className="w-5 h-5 text-orange-500 mb-4" />
                                <p className="text-xs font-black uppercase text-gray-500 tracking-widest mb-1">Pendentes</p>
                                <h4 className="text-2xl font-black text-white tracking-tighter">
                                  {editorPendentes} pendentes
                                </h4>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Newly Prominent Upcoming Posts Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-semibold flex items-center gap-2 text-lg">
                        <Clock className="w-5 h-5 text-orange-500" />
                        {userRole === 'supplier' ? 'Próximas Postagens' : userRole === 'editor' ? 'Próximas Produções' : 'Próximas Postagens'}
                      </h3>
                      <button 
                        onClick={() => setActiveTab(userRole === 'supplier' || userRole === 'editor' ? 'production_line' : 'planner')} 
                        className="text-orange-500 text-sm hover:underline"
                      >
                        {userRole === 'supplier' || userRole === 'editor' ? 'Ir para Produção' : 'Ir para o Planejador'}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {userRole !== 'editor' && supplierDashboardSchedule
                        .filter(s => {
                          const statusMatch = s.status !== ScheduleStatus.POSTED;
                          if (userRole === 'supplier' && linkedProducer) {
                            return needsSupplierDashboardAction(s, linkedProducer.id);
                          }
                          return statusMatch;
                        })
                        .sort((a,b) => a.date.localeCompare(b.date))
                        .slice(0, 4)
                        .map((item) => (
                          <div 
                            key={item.id} 
                            onClick={() => {
                              setProductionActiveProducerId(item.producerId || 'unassigned');
                              setProductionActiveProductId(item.productId);
                              setActiveTab('production_line');
                            }}
                            className="p-4 bg-[#141414] border border-[#222] rounded-2xl flex items-start gap-4 hover:border-orange-500/50 transition-colors group cursor-pointer w-full"
                          >
                            <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-500 group-hover:bg-orange-500 group-hover:text-black transition-colors shrink-0">
                              <Clock className="w-5 h-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                               <p className="text-sm font-bold text-white truncate">
                                 {userRole === 'supplier' 
                                   ? (products.find(p => p.id === item.productId)?.name || 'Sem produto')
                                   : (accounts.find(a => a.id === item.accountId)?.name || 'Conta')}
                               </p>
                               <p className="text-[10px] text-gray-500 mt-0.5">{item.date}</p>
                               {userRole !== 'supplier' && (
                                 <div className="mt-2 flex items-center gap-1">
                                   <span className="text-[10px] text-gray-400 truncate">{products.find(p => p.id === item.productId)?.name || 'Sem produto'}</span>
                                 </div>
                               )}
                               <div className="mt-2.5">
                                 <span className={`px-2 py-1 rounded-md text-[8px] font-black uppercase border inline-flex items-center leading-none tracking-wider ${
                                   item.status === ScheduleStatus.POSTED ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                                   item.status === ScheduleStatus.PRODUCED ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                                   item.status === ScheduleStatus.EDITING ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                                   item.status === ScheduleStatus.CANCELLED ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                   'bg-orange-500/10 text-orange-400 border-orange-500/20'
                                 }`}>
                                   {item.status === ScheduleStatus.POSTED ? 'Postado' : 
                                    item.status === ScheduleStatus.PRODUCED ? 'Pronto' : 
                                    item.status === ScheduleStatus.EDITING ? 'Edição' :
                                    item.status === ScheduleStatus.CANCELLED ? 'Cancelado' :
                                    'Planejado'}
                                 </span>
                               </div>
                            </div>
                          </div>
                      ))}

                      {userRole === 'editor' && linkedProducer && schedule
                        .filter(s => {
                          const statusMatch = s.status !== ScheduleStatus.POSTED;
                          return statusMatch && s.producerId === linkedProducer.id && hasEditableMaterial(s);
                        })
                        .sort((a, b) => a.date.localeCompare(b.date))
                        .slice(0, 4)
                        .map((item) => {
                          const prod = products.find(p => p.id === item.productId);
                          return (
                            <div 
                              key={item.id} 
                              onClick={() => {
                                setProductionActiveProducerId(linkedProducer.id);
                                setProductionActiveProductId(item.productId);
                                setActiveTab('production_line');
                              }}
                              className="p-4 bg-[#141414] border border-[#222] rounded-2xl flex items-center gap-4 hover:border-orange-500/50 transition-all cursor-pointer group w-full"
                            >
                              <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center border border-orange-500/20 overflow-hidden shrink-0 group-hover:scale-105 transition-transform">
                                {prod?.imageUrl ? (
                                  <img src={prod.imageUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <Video className="w-5 h-5 text-orange-500" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-white truncate group-hover:text-orange-500 transition-colors">
                                  {prod?.name || 'Sem produto'}
                                </p>
                                <p className="text-[10px] text-gray-500 mt-0.5 capitalize">{prod?.category || 'Geral/Misc'}</p>
                                <div className="mt-2 flex items-center gap-1.5">
                                  <Clock className="w-3 h-3 text-orange-500/80" />
                                  <span className="text-[10px] text-gray-400">{item.date}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                      {(() => {
                        if (userRole === 'editor') {
                          const editorCount = schedule.filter(s => {
                            const statusMatch = s.status !== ScheduleStatus.POSTED;
                            return statusMatch && linkedProducer && s.producerId === linkedProducer.id && hasEditableMaterial(s);
                          }).length;
                          
                          if (editorCount === 0) {
                            return (
                              <div className="lg:col-span-4 p-8 bg-[#141414] border border-[#222] border-dashed rounded-2xl flex flex-col items-center justify-center text-gray-500 gap-2 w-full">
                                <Plus className="w-6 h-6 opacity-20" />
                                <p className="text-sm italic">
                                  Nenhuma produção pendente no momento
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }
                        const count = supplierDashboardSchedule.filter(s => {
                          const statusMatch = s.status !== ScheduleStatus.POSTED;
                          if (userRole === 'supplier' && linkedProducer) {
                            return needsSupplierDashboardAction(s, linkedProducer.id);
                          }
                          return statusMatch;
                        }).length;
                        return count === 0 ? (
                          <div className="lg:col-span-4 p-8 bg-[#141414] border border-[#222] border-dashed rounded-2xl flex flex-col items-center justify-center text-gray-500 gap-2">
                            <Plus className="w-6 h-6 opacity-20" />
                            <p className="text-sm italic">
                              {userRole === 'supplier' ? 'Nenhum produto para preparar no momento' : 'Nenhuma postagem pendente no momento'}
                            </p>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  {/* Replication Suggestions Section */}
                  {userRole !== 'supplier' && userRole !== 'editor' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-white font-semibold flex items-center gap-2 text-lg">
                          <Zap className="w-5 h-5 text-yellow-500" />
                          Próximas Postagens (Baseadas em Vendas)
                        </h3>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {getReplicationSuggestions().map((sug, idx) => {
                          const acc = accounts.find(a => a.id === sug.accountId);
                          const prod = products.find(p => p.id === sug.productId);
                          if (!acc || !prod) return null;

                          return (
                            <div key={`${sug.accountId}-${sug.productId}`} className="p-5 bg-[#141414] border border-[#222] rounded-2xl flex flex-col gap-3 relative overflow-hidden group hover:border-yellow-500/30 transition-colors">
                              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Zap className="w-12 h-12 text-yellow-500" />
                              </div>
                              <div className="flex items-center justify-between relative z-10">
                                 <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-md border ${
                                   sug.phase === WinningStatus.SCALED ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                                   sug.phase === WinningStatus.WINNER ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                                   'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                 }`}>
                                   {phaseMap[sug.phase] || sug.phase}
                                 </span>
                                 <button 
                                   onClick={() => markSuggestionAsCompleted(sug.accountId, sug.productId)}
                                   className="w-6 h-6 bg-[#0a0a0a] border border-[#333] rounded-lg flex items-center justify-center hover:border-orange-500 hover:bg-orange-500/5 transition-all group/check"
                                   title="Marcar como feito"
                                 >
                                   <motion.div
                                     whileHover={{ scale: 1.1 }}
                                     whileTap={{ scale: 0.9 }}
                                   >
                                     <CheckCircle2 className="w-4 h-4 text-gray-600 group-hover/check:text-orange-500 transition-colors" />
                                   </motion.div>
                                 </button>
                              </div>
                              <div>
                                 <p className="text-sm font-bold text-white mb-1">{acc.name}</p>
                                 <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-gray-400 font-medium">{prod.name}</span>
                                 </div>
                              </div>
                              <div className="mt-2 p-3 bg-[#0a0a0a] rounded-xl border border-[#222]">
                                 <p className="text-xs font-bold text-white flex items-center gap-2">
                                    <Plus className="w-3 h-3 text-yellow-500" />
                                    Postar {sug.count} vídeos hoje
                                 </p>
                                 <p className="text-[10px] text-gray-500 mt-1">Lembrete para replicar o sucesso</p>
                              </div>
                            </div>
                          );
                        })}
                        {getReplicationSuggestions().length === 0 && (
                          <div className="lg:col-span-3 p-12 bg-[#141414] border border-[#222] border-dashed rounded-3xl flex flex-col items-center justify-center text-gray-500 gap-3 grayscale opacity-50">
                            <Zap className="w-8 h-8" />
                            <p className="text-sm">Aguardando performance de vendas para sugestões</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                    <StatCard title="Total Contas" value={dashboardAccounts.length} icon={Layers} color="orange" />
                    <StatCard title="Escaladas" value={dashboardAccounts.filter(a => a.stage === AccountStage.SCALING || a.stage === AccountStage.SCALED).length} icon={TrendingUp} color="green" />
                    <StatCard title="Violações" value={dashboardViolations.filter(v => !v.resolved).length} icon={AlertTriangle} color="red" />
                    <StatCard 
                      title="Postados Hoje" 
                      value={`${supplierDashboardSchedule.filter(s => s.date === getLocalDateString() && s.status === ScheduleStatus.POSTED).length} / ${supplierDashboardSchedule.filter(s => s.date === getLocalDateString()).length}`} 
                      icon={Calendar} 
                      color="blue" 
                    />
                  </div>

                  {!isPartner && (
                    <div className="p-12 bg-[#141414] border border-[#222] rounded-[2.5rem] flex flex-col items-center justify-center text-center gap-4">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
                        <Lock className="w-8 h-8 text-gray-600" />
                      </div>
                      <div>
                        <h4 className="text-xl font-bold text-white">Modo Colaborador Ativo</h4>
                        <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">Você tem acesso a todas as ferramentas operacionais, mas os dados financeiros são visíveis apenas para os sócios.</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-semibold">Resumo das Contas</h3>
                      <button onClick={() => setActiveTab('accounts')} className="text-orange-500 text-sm hover:underline">Ver tudo</button>
                    </div>
                    <div className="bg-[#141414] border border-[#222] rounded-2xl shadow-xl overflow-hidden">
                      <div className="overflow-x-auto no-scrollbar">
                        <table className="w-full text-left min-w-[700px]">
                          <thead>
                            <tr className="border-b border-[#222] bg-[#1a1a1a]/50">
                              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Conta</th>
                              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Saúde</th>
                              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">Produtos</th>
                              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Post/Dia</th>
                              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Meta/Dia</th>
                              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Estágio</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#222]">
                            {dashboardAccounts.slice(0, 8).map((acc) => {
                              const todayStr = getLocalDateString();
                              const postsToday = supplierDashboardSchedule.filter(s => s.accountId === acc.id && s.date === todayStr && s.status === ScheduleStatus.POSTED).length;

                              return (
                                <tr key={acc.id} className="hover:bg-[#1a1a1a] transition-colors">
                                  <td data-label="Conta" className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center overflow-hidden">
                                        {acc.imageUrl ? (
                                          <img src={acc.imageUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                          <Monitor className="w-4 h-4 text-gray-400" />
                                        )}
                                      </div>
                                      <div>
                                        <p className="text-sm font-medium text-white">{acc.name}</p>
                                        <p className="text-[10px] text-gray-500 uppercase">{acc.platform}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td data-label="Saude" className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                      <div className={`w-2 h-2 rounded-full ${acc.healthPoints > 195 ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.3)]' : acc.healthPoints >= 145 ? 'bg-yellow-500' : 'bg-red-500'}`} />
                                      <span className={`text-sm font-bold ${acc.healthPoints > 195 ? 'text-green-500' : acc.healthPoints >= 145 ? 'text-yellow-500' : 'text-red-500'}`}>
                                        {acc.healthPoints} <span className="text-[10px] opacity-70">pts</span>
                                      </span>
                                    </div>
                                  </td>
                                  <td data-label="Produtos" className="px-6 py-4 text-center">
                                    <span className="text-sm text-white font-bold bg-[#1a1a1a] px-2 py-1 rounded-lg border border-[#222]">
                                      {acc.linkedProductIds?.length || 0}
                                    </span>
                                  </td>
                                  <td data-label="Post/Dia" className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-sm font-bold ${postsToday >= acc.productionFrequency ? 'text-green-500' : 'text-white'}`}>{postsToday}</span>
                                      <div className="w-12 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                        <div 
                                          className={`h-full transition-all ${postsToday >= acc.productionFrequency ? 'bg-green-500' : 'bg-orange-500'}`} 
                                          style={{ width: `${Math.min((postsToday / acc.productionFrequency) * 100, 100)}%` }}
                                        />
                                      </div>
                                    </div>
                                  </td>
                                  <td data-label="Meta/Dia" className="px-6 py-4">
                                    <span className="text-sm font-mono text-gray-400 font-bold">{acc.productionFrequency}x</span>
                                  </td>
                                  <td data-label="Estagio" className="px-6 py-4">
                                    <StageBadge stage={acc.stage} />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-semibold">Resumo dos Produtos</h3>
                      <button onClick={() => setActiveTab('products')} className="text-orange-500 text-sm hover:underline">Ver todos produtos</button>
                    </div>
                    <div className="bg-[#141414] border border-[#222] rounded-2xl shadow-2xl overflow-hidden">
                      <div className="overflow-x-auto no-scrollbar">
                        <table className="w-full text-left min-w-[600px]">
                          <thead>
                            <tr className="border-b border-[#222] bg-[#1a1a1a]/50">
                              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Produto</th>
                              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Contas Ativas</th>
                              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Fase</th>
                              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Categoria</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#222]">
                            {products.slice(0, 10).map((prod) => {
                              const linkedInAccount = accounts.filter(a => a.linkedProductIds?.includes(prod.id));
                              const linkedInSchedule = Array.from(new Set(
                                schedule.filter(s => s.productId === prod.id).map(s => s.accountId)
                              )).map(id => accounts.find(a => a.id === id)).filter(Boolean);
                              const allLinkedAccounts = Array.from(new Map([...linkedInSchedule, ...linkedInAccount].map(a => [a!.id, a])).values());

                              return (
                                <tr key={prod.id} className="hover:bg-[#1a1a1a] transition-colors">
                                  <td data-label="Produto" className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center overflow-hidden">
                                        {prod.imageUrl ? (
                                          <img src={prod.imageUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                          <Hash className="w-4 h-4 text-gray-500" />
                                        )}
                                      </div>
                                      <span className="text-sm font-medium text-white">{prod.name}</span>
                                    </div>
                                  </td>
                                  <td data-label="Contas Ativas" className="px-6 py-4">
                                    <div className="relative">
                                      <button 
                                        onClick={() => setExpandedProductAccounts(expandedProductAccounts === prod.id ? null : prod.id)}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all group ${
                                          expandedProductAccounts === prod.id 
                                            ? 'bg-orange-500/10 border-orange-500/50' 
                                            : 'bg-[#141414] border-[#222] hover:border-gray-600'
                                        }`}
                                      >
                                        <Monitor className="w-4 h-4 text-orange-500" />
                                        <span className="text-sm font-bold text-white">{allLinkedAccounts.length}</span>
                                        <span className="text-xs text-gray-500 group-hover:text-gray-400">Contas</span>
                                        {expandedProductAccounts === prod.id ? <ChevronUp className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
                                      </button>
                                      
                                      <AnimatePresence>
                                        {expandedProductAccounts === prod.id && allLinkedAccounts.length > 0 && (
                                          <>
                                            <div className="fixed inset-0 z-10" onClick={() => setExpandedProductAccounts(null)} />
                                            <motion.div 
                                              initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                              animate={{ opacity: 1, scale: 1, y: 0 }}
                                              exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                              className="absolute md:right-0 lg:left-0 mt-2 w-64 bg-[#1a1a1a] border border-[#222] rounded-2xl shadow-2xl z-20 overflow-hidden"
                                            >
                                              <div className="p-3 border-b border-[#222] bg-[#222]/30">
                                                <p className="text-[10px] font-black uppercase text-gray-500">Contas Ativas vinculadas</p>
                                              </div>
                                              <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                                {allLinkedAccounts.map(acc => (
                                                  <div key={acc.id} className="flex items-center gap-3 p-3 hover:bg-[#222] border-b border-[#222]/50 last:border-0 transition-colors">
                                                    <div className="w-8 h-8 bg-[#141414] rounded-lg flex items-center justify-center overflow-hidden">
                                                      {acc.imageUrl ? <img src={acc.imageUrl} className="w-full h-full object-cover" alt="" /> : <Monitor className="w-4 h-4 text-orange-500" />}
                                                    </div>
                                                    <div className="flex-1">
                                                      <p className="text-xs font-bold text-white line-clamp-1">{acc.name}</p>
                                                      <p className="text-[10px] text-gray-500 capitalize">{acc.platform}</p>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            </motion.div>
                                          </>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  </td>
                                  <td data-label="Fase" className="px-6 py-4">
                                    <WinningStatusBadge status={prod.winningStatus} />
                                  </td>
                                  <td data-label="Categoria" className="px-6 py-4 text-xs text-gray-500">
                                    {prod.category || 'N/A'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab.startsWith('accounts') && <AccountsManager accounts={accounts} user={user} subView={activeTab === 'accounts_new' ? 'new' : 'edit'} products={products} viewMode={viewMode} setActiveTab={setActiveTab} />}
              {activeTab === 'planner' && <Planner schedule={schedule} accounts={accounts} products={products} user={user} viewMode={viewMode} producers={producers} tiktokLinks={tiktokLinks} />}
              {activeTab.startsWith('production') && (
                <Production 
                  schedule={schedule} 
                  accounts={accounts} 
                  products={products} 
                  producers={producers} 
                  userProfiles={userProfiles}
                  user={user} 
                  profile={profile}
                  isPartner={isPartner}
                  subView={activeTab === 'production_line' ? 'line' : activeTab === 'production_suppliers' ? 'suppliers' : activeTab === 'production_library' ? 'library' : 'editors'} 
                  viewMode={viewMode} 
                  driveAccessToken={driveAccessToken} 
                  setDriveAccessToken={setDriveAccessToken} 
                  driveConfigured={driveConfigured}
                  activeProducerId={productionActiveProducerId}
                  setActiveProducerId={setProductionActiveProducerId}
                  activeProductId={productionActiveProductId}
                  setActiveProductId={setProductionActiveProductId}
                  setActiveTab={setActiveTab}
                  sales={sales}
                  tiktokLinks={tiktokLinks}
                />
              )}
              {activeTab.startsWith('products') && <ProductManager products={products} producers={producers} user={user} subView={activeTab === 'products_new' ? 'new' : 'edit'} isPartner={isPartner} ProtectedValue={ProtectedValue} viewMode={viewMode} setActiveTab={setActiveTab} />}
              {activeTab === 'sales' && <SalesRegistry schedule={schedule} accounts={accounts} products={products} user={user} sales={sales} tiktokLinks={tiktokLinks} isPartner={isPartner} ProtectedValue={ProtectedValue} viewMode={viewMode} />}
              {activeTab === 'violations' && <ViolationTracker violations={violations} accounts={accounts} user={user} viewMode={viewMode} />}
              {activeTab === 'integrations' && <IntegrationsManager accounts={accounts} />}
              {activeTab === 'users' && <UserManager contextUser={user} isPartner={isPartner} />}
              {activeTab === 'ready_videos' && <ReadyVideosManager schedule={schedule} accounts={accounts} products={products} producers={producers} />}
              {activeTab === 'creators' && <CreatorsManager sales={sales} tiktokLinks={tiktokLinks} schedule={schedule} products={products} accounts={accounts} isPartner={isPartner} ProtectedValue={ProtectedValue} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function UserManager({ contextUser, isPartner }: { contextUser: FirebaseUser, isPartner: boolean }) {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch all profiles in COMPANY mode
    const q = query(collection(db, 'user_profiles'), where('viewMode', '==', ViewMode.COMPANY));
    const unsub = onSnapshot(q, (snapshot) => {
      setProfiles(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile)));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'user_profiles'));

    return unsub;
  }, []);

  const toggleRole = async (profile: UserProfile) => {
    if (!isPartner) return;
    const newRole = profile.role === UserRole.PARTNER ? UserRole.EMPLOYEE : UserRole.PARTNER;
    try {
      await updateDoc(doc(db, 'user_profiles', profile.id), { role: newRole });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `user_profiles/${profile.id}`);
    }
  };

  if (loading) return <div className="p-12 text-center text-gray-500">Carregando usuários...</div>;
  if (!isPartner) return <div className="p-12 text-center text-gray-500">Acesso negado. Apenas sócios podem gerenciar usuários.</div>;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-xl font-bold text-white">Gestão da Equipe</h3>
        <p className="text-sm text-gray-500">Controle quem tem acesso de Sócio ou Colaborador na camada Empresa.</p>
      </div>

      <div className="bg-[#141414] border border-[#222] rounded-3xl overflow-hidden shadow-2xl">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[#222] bg-[#1a1a1a]/50">
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Usuário</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Função Atual</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#222]">
            {profiles.sort((a,b) => a.role.localeCompare(b.role)).map((p) => (
              <tr key={p.id} className="hover:bg-[#1a1a1a] transition-colors">
                <td data-label="Usuario" className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <img src={p.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.displayName)}`} className="w-8 h-8 rounded-full" alt="" referrerPolicy="no-referrer" />
                    <div>
                      <p className="text-sm font-bold text-white">{p.displayName}</p>
                      <p className="text-[10px] text-gray-500">{p.email}</p>
                    </div>
                  </div>
                </td>
                <td data-label="Funcao Atual" className="px-6 py-4">
                  <span className={`text-[10px] uppercase font-black px-2 py-1 rounded border ${
                    p.role === UserRole.PARTNER ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 'bg-green-500/10 text-green-500 border-green-500/20'
                  }`}>
                    {p.role === UserRole.PARTNER ? 'Sócio' : 'Colaborador'}
                  </span>
                </td>
                <td data-label="Acoes" className="px-6 py-4 text-right">
                  {p.uid !== contextUser.uid ? (
                    <button 
                      onClick={() => toggleRole(p)}
                      className="text-[10px] font-black uppercase text-gray-500 hover:text-white transition-colors border border-[#222] px-3 py-1.5 rounded-lg hover:bg-[#222]"
                    >
                      Alterar para {p.role === UserRole.PARTNER ? 'Colaborador' : 'Sócio'}
                    </button>
                  ) : (
                    <span className="text-[10px] font-black uppercase text-gray-700 italic">Sua conta</span>
                  )}
                </td>
              </tr>
            ))}
            {profiles.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-gray-500 italic">Nenhum usuário registrado na empresa.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function IntegrationsManager({ accounts }: { accounts: Account[] }) {
  const [authorizing, setAuthorizing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'Não conectado' | 'Autorização pendente' | 'Conectado' | 'Erro de autorização'>('Não conectado');
  const [message, setMessage] = useState<string | null>(null);

  const creatorConnections = accounts.filter((account) => {
    const acc = account as any;
    return acc.tiktokShopCreatorConnected || acc.tiktokShopCreatorStatus || acc.tiktokShopCreatorHandle;
  });

  useEffect(() => {
    if (creatorConnections.some((account) => (account as any).tiktokShopCreatorStatus === 'connected' || (account as any).tiktokShopCreatorConnected)) {
      setConnectionStatus('Conectado');
    }
  }, [creatorConnections.length]);

  const handleAuthorizeCreator = async () => {
    setAuthorizing(true);
    setConnectionStatus('Autorização pendente');
    setMessage(null);

    try {
      const response = await fetch('/api/tiktok/creator-auth-url');
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.configured || !data?.url) {
        setConnectionStatus('Erro de autorização');
        setMessage(data?.error || 'Configuração TikTok Shop Creator ainda pendente. Verifique App Key, Secret e URL de autorização no Partner Center.');
        return;
      }

      const popup = window.open(data.url, 'tiktok_shop_creator_auth', 'width=720,height=820,noopener,noreferrer');
      if (!popup) {
        setMessage('Permita pop-ups neste navegador para abrir a autorização TikTok Shop Creator.');
      }
    } catch (error) {
      console.error('Erro ao iniciar autorização TikTok Shop Creator:', error);
      setConnectionStatus('Erro de autorização');
      setMessage('Configuração TikTok Shop Creator ainda pendente. Verifique App Key, Secret e URL de autorização no Partner Center.');
    } finally {
      setAuthorizing(false);
    }
  };

  const statusStyles: Record<typeof connectionStatus, string> = {
    'Não conectado': 'border-gray-700 bg-white/5 text-gray-300',
    'Autorização pendente': 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
    'Conectado': 'border-green-500/30 bg-green-500/10 text-green-400',
    'Erro de autorização': 'border-red-500/30 bg-red-500/10 text-red-400',
  };

  const statusIcon = connectionStatus === 'Conectado'
    ? CheckCircle2
    : connectionStatus === 'Autorização pendente'
      ? Clock
      : connectionStatus === 'Erro de autorização'
        ? AlertTriangle
        : Link2;
  const StatusIcon = statusIcon;

  return (
    <div className="space-y-6">
      <div className="bg-[#141414] border border-[#222] rounded-3xl p-6 md:p-8 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-4 max-w-3xl">
            <div className="w-12 h-12 rounded-2xl bg-[#ff0050]/10 border border-[#ff0050]/20 flex items-center justify-center">
              <Zap className="w-6 h-6 text-[#ff0050]" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl md:text-3xl font-black text-white">Conexões TikTok Shop Creator</h3>
              <p className="text-sm md:text-base text-gray-400 leading-relaxed">
                Conecte contas TikTok Shop Creator/Afiliado para autorizar o Influency Club a acessar dados comerciais disponíveis via TikTok Shop Open Platform.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-3">
            <span className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-wider ${statusStyles[connectionStatus]}`}>
              <StatusIcon className="w-4 h-4" />
              {connectionStatus}
            </span>
            <button
              onClick={handleAuthorizeCreator}
              disabled={authorizing}
              className="inline-flex items-center justify-center gap-2 bg-[#ff0050] text-white px-5 py-3 rounded-xl font-black text-sm hover:bg-[#ff2f6d] transition-all shadow-lg active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <ExternalLink className="w-4 h-4" />
              {authorizing ? 'Abrindo autorização...' : 'Autorizar conta TikTok Shop Creator'}
            </button>
          </div>
        </div>

        {message && (
          <div className="mt-6 border border-red-500/25 bg-red-500/10 text-red-200 rounded-2xl p-4 text-sm leading-relaxed">
            {message}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {(['Não conectado', 'Autorização pendente', 'Conectado', 'Erro de autorização'] as const).map((status) => (
          <div key={status} className={`border rounded-2xl p-4 ${connectionStatus === status ? statusStyles[status] : 'border-[#222] bg-[#141414] text-gray-500'}`}>
            <p className="text-[10px] font-black uppercase tracking-wider">{status}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#141414] border border-[#222] rounded-3xl overflow-hidden">
        <div className="px-6 py-5 border-b border-[#222] flex items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-black uppercase tracking-wider text-white">Contas conectadas</h4>
            <p className="text-xs text-gray-500 mt-1">Estrutura preparada para futuras autorizações TikTok Shop Creator.</p>
          </div>
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">{creatorConnections.length} conta(s)</span>
        </div>

        {creatorConnections.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            Nenhuma conta TikTok Shop Creator conectada ainda.
          </div>
        ) : (
          <div className="divide-y divide-[#222]">
            {creatorConnections.map((account) => {
              const acc = account as any;
              const status = acc.tiktokShopCreatorStatus || (acc.tiktokShopCreatorConnected ? 'Conectado' : 'Autorização pendente');
              return (
                <div key={account.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">{account.name}</p>
                    <p className="text-xs text-gray-500">{acc.tiktokShopCreatorHandle || account.handle || 'TikTok Shop Creator/Afiliado'}</p>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">{status}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function LegacyIntegrationsManager({ user, accounts, viewMode, products, checkedAccountsRef }: { user: FirebaseUser, accounts: Account[], viewMode: ViewMode, products: Product[], checkedAccountsRef?: any }) {
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncingShowcase, setSyncingShowcase] = useState<string | null>(null);
  const [syncingSaved, setSyncingSaved] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.service === 'tiktok_shop') {
        const tiktokData = event.data.data;
        console.log("TikTok Connection Success:", tiktokData);
        handleTikTokSuccess(tiktokData);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [user, accounts]);

  const handleTikTokSuccess = async (data: any) => {
    try {
      const existingAccount = accounts.find(a => (a as any).tiktokShopId === data.shop_id || a.name === (data.seller_name || data.creator_name));
      
      if (existingAccount) {
        await updateDoc(doc(db, 'accounts', existingAccount.id), {
          tiktokShopId: data.shop_id || 'affiliate_account',
          tiktokAccessToken: data.access_token,
          tiktokRefreshToken: data.refresh_token,
          isAffiliate: true,
          updatedAt: new Date().toISOString()
        });
      } else {
        await addDoc(collection(db, 'accounts'), {
          userId: user.uid,
          scope: viewMode === ViewMode.COMPANY ? 'COMPANY' : 'PERSONAL',
          name: data.seller_name || data.creator_name || 'TikTok Afiliado',
          handle: data.shop_id || 'affiliate',
          platform: 'TikTok',
          status: AccountStatus.ACTIVE,
          stage: AccountStage.TESTING,
          productionFrequency: 3,
          healthPoints: 200,
          tiktokShopId: data.shop_id || 'affiliate',
          tiktokAccessToken: data.access_token,
          tiktokRefreshToken: data.refresh_token,
          isAffiliate: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      alert('Conta de Afiliado conectada com sucesso!');
    } catch (error) {
      console.error("Error saving TikTok connection:", error);
      alert('Erro ao salvar conexão: ' + error);
    }
  };

  const syncShowcaseProducts = async (account: Account, isSimulating: boolean = false) => {
    const acc = account as any;
    if (!acc.tiktokAccessToken && !isSimulating) {
      alert('Esta conta não está devidamente conectada.');
      return;
    }

    setSyncingShowcase(account.id);
    try {
      const url = `/api/tiktok/sync-showcase?access_token=${acc.tiktokAccessToken || ''}&simulate=${isSimulating ? 'true' : 'false'}`;
      const resp = await fetch(url);
      const data = await resp.json();

      if (data.error) throw new Error(data.error);

      // Handle products list from API response
      const incomingProducts = data.products || [];
      if (incomingProducts.length === 0) {
        alert('Nenhum produto encontrado na vitrine desta conta.');
        return;
      }

      const existingProductNames = new Set(
        products.map(p => p.name.toLowerCase().trim())
      );

      let importedCount = 0;
      let skippedCount = 0;

      for (const item of incomingProducts) {
        const titleNormalized = item.title.trim();
        if (existingProductNames.has(titleNormalized.toLowerCase())) {
          skippedCount++;
          continue;
        }

        const price = parseFloat(item.price?.min_price || "0");
        const commissionVal = parseFloat(item.commission_info?.commission_value || "0");

        await addDoc(collection(db, 'products'), {
          name: item.title,
          category: item.category || 'Vitrine Afiliados',
          winningStatus: WinningStatus.TESTING,
          price: price,
          commissionValue: commissionVal,
          imageUrl: item.cover_image || '',
          productUrl: item.product_url || '',
          externalProductId: item.product_id,
          userId: user.uid,
          scope: viewMode === ViewMode.COMPANY ? 'COMPANY' : 'PERSONAL',
          createdAt: new Date().toISOString()
        });

        existingProductNames.add(titleNormalized.toLowerCase());
        importedCount++;
      }

      alert(`Sincronização da vitrine concluída com sucesso!\n\nImportados: ${importedCount} novos produtos.\nPulados (já cadastrados anteriormente): ${skippedCount}.`);
    } catch (error: any) {
      console.error(error);
      alert('Erro ao sincronizar produtos da vitrine: ' + error.message);
    } finally {
      setSyncingShowcase(null);
    }
  };

  const syncSavedProducts = async (account: Account, isSimulating: boolean = false) => {
    const acc = account as any;
    if (!acc.tiktokAccessToken && !isSimulating) {
      alert('Esta conta não está devidamente conectada.');
      return;
    }

    setSyncingSaved(account.id);
    try {
      const url = `/api/tiktok/sync-saved?access_token=${acc.tiktokAccessToken || ''}&simulate=${isSimulating ? 'true' : 'false'}`;
      const resp = await fetch(url);
      const data = await resp.json();

      if (data.error) throw new Error(data.error);

      // Handle selection products list from API response
      const incomingProducts = data.products || [];
      if (incomingProducts.length === 0) {
        alert('Nenhum produto salvo encontrado nesta conta.');
        return;
      }

      const existingProductNames = new Set(
        products.map(p => p.name.toLowerCase().trim())
      );

      let importedCount = 0;
      let skippedCount = 0;

      for (const item of incomingProducts) {
        const titleNormalized = item.title.trim();
        if (existingProductNames.has(titleNormalized.toLowerCase())) {
          skippedCount++;
          continue;
        }

        const price = parseFloat(item.price?.min_price || "0");
        const commissionVal = parseFloat(item.commission_info?.commission_value || "0");

        await addDoc(collection(db, 'products'), {
          name: item.title,
          category: item.category || 'Produtos Salvos',
          winningStatus: WinningStatus.TESTING,
          price: price,
          commissionValue: commissionVal,
          imageUrl: item.cover_image || '',
          productUrl: item.product_url || '',
          externalProductId: item.product_id,
          userId: user.uid,
          scope: viewMode === ViewMode.COMPANY ? 'COMPANY' : 'PERSONAL',
          createdAt: new Date().toISOString(),
          autoRegistered: true,
          originAccountId: account.id
        });

        existingProductNames.add(titleNormalized.toLowerCase());
        importedCount++;
      }

      alert(`Registrador Automático: Sincronização de salvos concluída!\n\nImportados: ${importedCount} novos produtos.\nPulados (já cadastrados): ${skippedCount}.`);
    } catch (error: any) {
      console.error(error);
      alert('Erro ao processar registrador automático: ' + error.message);
    } finally {
      setSyncingSaved(null);
    }
  };

  const syncOrders = async (account: Account) => {
    const acc = account as any;
    if (!acc.tiktokAccessToken) {
      alert('Esta conta não está devidamente conectada.');
      return;
    }

    setSyncing(account.id);
    try {
      const resp = await fetch(`/api/tiktok/sync-orders?access_token=${acc.tiktokAccessToken}`);
      const data = await resp.json();

      if (data.error) throw new Error(data.error);

      // Affiliate Orders (V2) typically come in 'order_list' or similar
      const orders = data.orders || data.order_list || [];
      let newSalesCount = 0;

      for (const order of orders) {
        // Affiliate orders have different status codes, but we usually look for 'SETTLED' or 'COMPLETED'
        // In V2, 30 is completed for some, but for affiliates it might differ. 
        // We'll accept anything that has commission for now.
        if (order.commission_amount > 0) {
           await addDoc(collection(db, 'sales'), {
             userId: user.uid,
             date: getLocalDateString(new Date(order.create_time * 1000)),
             productId: 'tiktok_affiliate_product',
             accountId: account.id,
             quantity: 1,
             gmv: parseFloat(order.item_price || "0"),
             commission: parseFloat(order.commission_amount || "0"),
             externalOrderId: order.order_id,
             scope: viewMode === ViewMode.COMPANY ? 'COMPANY' : 'PERSONAL',
             createdAt: new Date().toISOString()
           });
           newSalesCount++;
        }
      }

      alert(`Sincronização concluída! ${newSalesCount} novas vendas de afiliado processadas.`);
    } catch (error) {
      console.error(error);
      alert('Erro ao sincronizar vendas: ' + error);
    } finally {
      setSyncing(null);
    }
  };

  const connectTikTokMock = async () => {
    try {
      const mockUserHandle = user?.email ? user.email.split('@')[0] : 'criador_demo';
      const mockData = {
        access_token: "mock_access_token_" + Math.random().toString(36).substring(7),
        refresh_token: "mock_refresh_token",
        shop_id: "affiliate_creator_shop",
        seller_name: `Criador @${mockUserHandle}`,
        creator_name: "Criador TikTok Afiliado"
      };
      await handleTikTokSuccess(mockData);
    } catch (e) {
      console.error(e);
    }
  };

  const connectTikTok = async () => {
    setConnecting(true);
    try {
      const resp = await fetch(`/api/auth/tiktok/url?state=${user.uid}`);
      const { url } = await resp.json();
      
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      window.open(url, 'tiktok_auth', `width=${width},height=${height},left=${left},top=${top}`);
    } catch (error) {
      console.error(error);
      alert('Erro ao iniciar conexão. Verifique se o app está configurado como Afiliado no Partner Center.');
    } finally {
      setConnecting(false);
    }
  };

  const connectedAccounts = accounts.filter(a => (a as any).tiktokAccessToken);

  return (
    <div className="space-y-6">
      <div className="bg-[#141414] border border-[#222] p-8 rounded-2xl shadow-xl">
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-black p-3 rounded-2xl border border-[#333]">
            <Zap className="w-8 h-8 text-[#ff0050]" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">TikTok Criador & Registrador Automático</h3>
            <p className="text-gray-500 text-sm">Vincule seu perfil do TikTok Criador para importar e cadastrar produtos salvos automaticamente.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-6 bg-orange-500/5 border border-orange-500/20 rounded-2xl mb-6 space-y-3">
            <h4 className="text-orange-500 font-bold text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Configuração Necessária no TikTok Partner Center
            </h4>
            <p className="text-xs text-gray-400 leading-relaxed">
              Para que o Registrador Automático de Produtos funcione com seu perfil de afiliado, acesse as configurações do aplicativo que você criou no <strong>TikTok Shop Partner Center</strong> e sob a aba <strong>"Gerenciar API"</strong>, ative (ligue as chaves) obrigatoriamente os seguintes pacotes de API:
            </p>
            <ul className="text-xs text-gray-300 space-y-2.5 pl-2">
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                <div>
                  <strong className="text-white">Affiliate Information</strong> 
                  <span className="text-gray-500 block font-mono text-[10px]">Escopo: creator.affiliate.info</span>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                <div>
                  <strong className="text-white">Read Creator Affiliate Collaboration</strong>
                  <span className="text-gray-500 block font-mono text-[10px]">Escopo: creator.affiliate_collaboration.read</span>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                <div>
                  <strong className="text-white">Manage Affiliate Links</strong> (Opcional, mas recomendado)
                  <span className="text-gray-500 block font-mono text-[10px]">Escopo: creator.affiliate.link.write</span>
                </div>
              </li>
            </ul>
            <p className="text-[11px] text-gray-500 italic mt-2 leading-relaxed">
              *Nota: Escopos que começam com "seller.*" ou "partner.*" destinam-se a vendedores ou campanhas de agências e não são necessários para o Registrador Automático do seu perfil.
            </p>
          </div>

          <div className="p-4 bg-[#0a0a0a] border border-[#222] rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center font-bold text-white italic text-xl">
                TT
              </div>
              <div>
                <p className="text-sm font-bold text-white">Vincular Conta TikTok Criador</p>
                <p className="text-xs text-gray-500">Conexão Oficial TikTok Shop Open Platform / Afiliado</p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                onClick={connectTikTokMock}
                className="bg-[#222] border border-orange-500/30 hover:border-orange-500 text-orange-500 px-5 py-3 rounded-xl font-bold text-xs hover:bg-orange-500/10 transition-all"
                title="Bypassa restrições do sandbox e conecta perfil de teste imediatamente"
              >
                Conectar via Simulador Assistido
              </button>

              <button
                onClick={connectTikTok}
                disabled={connecting}
                className="bg-orange-500 text-black px-8 py-3 rounded-xl font-black text-sm hover:bg-orange-400 transition-all shadow-lg active:scale-95 disabled:opacity-50"
              >
                {connecting ? 'Conectando...' : 'Conectar Conta Criador'}
              </button>
            </div>
          </div>

          {connectedAccounts.length > 0 && (
            <div className="mt-8 space-y-4">
              <h4 className="text-xs font-black uppercase text-gray-500">Contas Conectadas</h4>
              {connectedAccounts.map(acc => (
                <div key={acc.id} className="p-5 bg-[#1a1a1a] border border-[#222] rounded-xl flex flex-col gap-4 animate-fadeIn">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <div>
                        <p className="text-sm font-bold text-white">{acc.name}</p>
                        <p className="text-[10px] text-gray-500">Perfil de Criador / Afiliado</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Synchronize Vitrine (Showcase) */}
                      <button
                        onClick={() => syncShowcaseProducts(acc, false)}
                        disabled={!!syncingShowcase || !!syncing || !!syncingSaved}
                        className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-lg text-xs font-bold hover:bg-gray-100 transition-all disabled:opacity-50"
                        title="Sincronizar produtos automaticamente da sua vitrine de afiliado TikTok"
                      >
                        <Layers className="w-4 h-4" />
                        {syncingShowcase === acc.id ? 'Buscando Vitrine...' : 'Sincronizar Vitrine'}
                      </button>

                      {/* Simulation Option */}
                      <button
                        onClick={() => syncShowcaseProducts(acc, true)}
                        disabled={!!syncingShowcase || !!syncing || !!syncingSaved}
                        className="flex items-center gap-2 bg-[#222] text-gray-300 border border-[#333] px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#2a2a2a] transition-all disabled:opacity-50"
                        title="Testar a sincronização usando produtos simulados excelentes (ex: Travesseiro Cervical)"
                      >
                        <Zap className="w-4 h-4 text-orange-500" />
                        Simular Vitrine (Demonstração)
                      </button>
                    </div>
                  </div>

                  {/* Registrador Automático de Produtos Salvos */}
                  <div className="pt-4 border-t border-[#222]/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="relative flex h-2 w-2">
                          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${acc.autoRegisterSaved ? 'bg-green-400' : 'bg-gray-400'}`}></span>
                          <span className={`relative inline-flex rounded-full h-2 w-2 ${acc.autoRegisterSaved ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                        </span>
                        <h5 className="text-[11px] font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                          Registrador Automático (Produtos Salvos / Seleção)
                        </h5>
                        <span className="bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded text-[8px] font-black uppercase border border-orange-500/10 tracking-widest leading-none">Ativo</span>
                      </div>
                      <p className="text-[11px] text-gray-400 leading-relaxed max-w-[650px]">
                        Importa e cadastra automaticamente nesta plataforma qualquer produto que você <strong>salvar ou favoritar</strong> no seu painel de afiliado TikTok (sem que precise estar na vitrine pública).
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {acc.autoRegisterSaved && (
                        <button
                          onClick={() => syncSavedProducts(acc, !(acc as any).tiktokAccessToken)}
                          disabled={!!syncingSaved || !!syncingShowcase || !!syncing}
                          className="flex items-center gap-1.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-orange-500 hover:text-black transition-all disabled:opacity-50"
                          title="Fazer uma busca manual instantânea por produtos recém salvos"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {syncingSaved === acc.id ? 'Buscando...' : 'Buscar Salvos'}
                        </button>
                      )}
                      
                      <label className="relative inline-flex items-center cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={!!acc.autoRegisterSaved}
                          onChange={async () => {
                            try {
                              await updateDoc(doc(db, 'accounts', acc.id), {
                                autoRegisterSaved: !acc.autoRegisterSaved,
                                updatedAt: new Date().toISOString()
                              });
                              if (!acc.autoRegisterSaved && checkedAccountsRef) {
                                // Clear cache to allow immediate background run on active
                                const cacheKey = `${acc.id}_${(acc as any).tiktokAccessToken || ''}`;
                                if (checkedAccountsRef.current) {
                                  checkedAccountsRef.current.delete(cacheKey);
                                }
                              }
                            } catch (e) {
                              console.error('Erro ao atualizar registrador automático:', e);
                            }
                          }}
                          className="sr-only peer" 
                        />
                        <div className="w-8 h-4 bg-[#222] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-orange-500 peer-checked:after:bg-black peer-checked:after:border-black relative"></div>
                        <span className="ml-2 text-[10px] font-black uppercase tracking-wider text-gray-400 peer-checked:text-white">
                          {acc.autoRegisterSaved ? 'Ativo' : 'Inativo'}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border border-[#222] rounded-xl bg-[#1a1a1a]">
              <h4 className="text-xs font-black uppercase text-gray-500 mb-2">Funcionamento do Importador</h4>
              <ul className="text-xs space-y-2 text-gray-400">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  Varre periodicamente sua seleção de produtos favoritados
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  Cadastra links de referência automaticamente no seu banco de dados
                </li>
              </ul>
            </div>
            
            <div className="p-4 border border-[#222] rounded-xl bg-[#1a1a1a]">
              <h4 className="text-xs font-black uppercase text-[#ff0050] mb-2">Importante</h4>
              <p className="text-xs text-gray-400 leading-relaxed">
                Assegure-se de que o App Key e Secret inseridos nas configurações de Secrets do AI Studio coincidam exatamente com os do seu Console no TikTok Partner Center.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }: { title: string, value: string | number, icon: any, color: string }) {
  const colors: Record<string, string> = {
    orange: 'text-orange-500 bg-orange-500/10',
    green: 'text-green-500 bg-green-500/10',
    red: 'text-red-500 bg-red-500/10',
    blue: 'text-blue-500 bg-blue-500/10'
  };
  return (
    <div className="bg-[#141414] border border-[#222] p-4 md:p-6 rounded-2xl shadow-sm">
      <div className="flex items-center justify-between mb-2 md:mb-4">
        <span className="text-[10px] md:text-sm font-medium text-gray-500 truncate">{title}</span>
        <div className={`p-1.5 md:p-2 rounded-lg ${colors[color]}`}>
          <Icon className="w-3 h-3 md:w-4 h-4" />
        </div>
      </div>
      <div className="text-xl md:text-3xl font-bold text-white tracking-tight">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: AccountStatus }) {
  const styles: Record<AccountStatus, string> = {
    [AccountStatus.ACTIVE]: 'bg-green-500/10 text-green-500 border-green-500/20',
    [AccountStatus.PAUSED]: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    [AccountStatus.VIOLATION_WARNING]: 'bg-red-500/10 text-red-500 border-red-500/20',
    [AccountStatus.SUSPENDED]: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${styles[status]}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function StageBadge({ stage }: { stage: AccountStage }) {
  const styles: Record<AccountStage, string> = {
    [AccountStage.TESTING]: 'bg-blue-500/10 text-blue-500',
    [AccountStage.SCALING]: 'bg-purple-500/10 text-purple-500',
    [AccountStage.SCALED]: 'bg-orange-500/10 text-orange-500',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${styles[stage]}`}>
      {stage}
    </span>
  );
}

function AccountsManager({ accounts, user, subView, products, viewMode, setActiveTab }: { accounts: Account[], user: FirebaseUser, subView: 'new' | 'edit', products: Product[], viewMode: ViewMode, setActiveTab: (t: string) => void }) {
  const [newAcc, setNewAcc] = useState({ name: '', platform: 'TikTok', status: AccountStatus.ACTIVE, stage: AccountStage.TESTING, productionFrequency: 1, healthPoints: 200, imageUrl: '' });
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [linkingAccount, setLinkingAccount] = useState<Account | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [initialLinkedIds, setInitialLinkedIds] = useState<string[]>([]);
  const [tempLinkedIds, setTempLinkedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>, isEditing: boolean) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Imagem muito grande. O limite é 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        if (isEditing && editingAccount) {
          setEditingAccount({ ...editingAccount, imageUrl: base64 });
        } else {
          setNewAcc({ ...newAcc, imageUrl: base64 });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const openLinkModal = (acc: Account) => {
    setLinkingAccount(acc);
    const linked = acc.linkedProductIds || [];
    setInitialLinkedIds(linked);
    setTempLinkedIds(linked);
    setActiveMenuId(null);
  };

  const handleCreate = async () => {
    if (!newAcc.name) return;
    try {
      await addDoc(collection(db, 'accounts'), {
        ...newAcc,
        userId: user.uid,
        scope: viewMode === ViewMode.COMPANY ? 'COMPANY' : 'PERSONAL',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setNewAcc({ name: '', platform: 'TikTok', status: AccountStatus.ACTIVE, stage: AccountStage.TESTING, productionFrequency: 1, healthPoints: 200, imageUrl: '' });
      setActiveTab('accounts_edit');
    } catch (e) { 
      handleFirestoreError(e, OperationType.CREATE, 'accounts');
    }
  };

  const handleUpdateAccount = async () => {
    if (!editingAccount || !editingAccount.name) return;
    try {
      await updateDoc(doc(db, 'accounts', editingAccount.id), {
        name: editingAccount.name,
        imageUrl: editingAccount.imageUrl || '',
        updatedAt: new Date().toISOString()
      });
      setEditingAccount(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `accounts/${editingAccount.id}`);
    }
  };

  const toggleProductLink = (productId: string) => {
    setTempLinkedIds(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleSaveLinks = async () => {
    if (!linkingAccount) return;
    try {
      await updateDoc(doc(db, 'accounts', linkingAccount.id), { 
        linkedProductIds: tempLinkedIds,
        updatedAt: new Date().toISOString()
      });
      setLinkingAccount(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `accounts/${linkingAccount.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta conta?')) return;
    try {
      await deleteDoc(doc(db, 'accounts', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `accounts/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-white mb-2 capitalize">
        {subView === 'new' ? 'Registrar Nova Conta' : 'Editar Contas Existentes'}
      </h3>

      {subView === 'new' && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="bg-[#141414] border border-[#222] p-6 rounded-2xl space-y-4 shadow-lg"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
            <div className="space-y-1">
              <label className="text-xs text-gray-500 uppercase font-bold">Nome da Conta</label>
              <input 
                placeholder="Ex: Minhas Ofertas" 
                className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl px-4 py-2 text-white outline-none focus:border-orange-500" 
                value={newAcc.name}
                onChange={e => setNewAcc({...newAcc, name: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500 uppercase font-bold">Plataforma</label>
              <select 
                className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl px-4 py-2 text-white outline-none focus:border-orange-500"
                value={newAcc.platform}
                onChange={e => setNewAcc({...newAcc, platform: e.target.value as any})}
              >
                <option value="TikTok">TikTok</option>
                <option value="Instagram">Instagram</option>
                <option value="Facebook">Facebook</option>
                <option value="Kwai">Kwai</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500 uppercase font-bold">Posts por Dia</label>
              <input 
                type="number"
                className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl px-4 py-2 text-white outline-none focus:border-orange-500" 
                value={newAcc.productionFrequency}
                onChange={e => setNewAcc({...newAcc, productionFrequency: parseInt(e.target.value)})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500 uppercase font-bold">Pontuação Inicial</label>
              <input 
                type="number"
                className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl px-4 py-2 text-white outline-none focus:border-orange-500" 
                value={newAcc.healthPoints}
                onChange={e => setNewAcc({...newAcc, healthPoints: parseInt(e.target.value)})}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Logo / Foto da Conta</label>
              <div className="flex items-center gap-4 p-4 bg-[#0a0a0a] border-2 border-dashed border-[#222] rounded-2xl hover:border-orange-500/50 transition-all group">
                <div className="w-16 h-16 rounded-full bg-[#141414] border border-[#222] overflow-hidden flex items-center justify-center shrink-0">
                  {newAcc.imageUrl ? (
                    <img src={newAcc.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <ImagePlus className="w-6 h-6 text-gray-700" />
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-bold text-white">Selecione o logo da conta</p>
                  <p className="text-[10px] text-gray-500 font-medium">Recomendado: Formato circular (PNG ou JPG)</p>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={(e) => handleFileChange(e, false)}
                  />
                  <div className="flex gap-2 pt-1">
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[10px] font-black uppercase tracking-wider text-orange-500 hover:text-orange-400 bg-orange-500/10 px-3 py-1.5 rounded-lg border border-orange-500/20"
                    >
                      Fazer Upload
                    </button>
                    {newAcc.imageUrl && (
                      <button 
                        onClick={() => setNewAcc({...newAcc, imageUrl: ''})}
                        className="text-[10px] font-black uppercase tracking-wider text-red-500 hover:text-red-400 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <button onClick={handleCreate} className="w-full bg-orange-500 text-black py-2 rounded-xl font-bold hover:bg-orange-400 transition-colors">Salvar Conta</button>
        </motion.div>
      )}

      {subView === 'edit' && (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {accounts.map(acc => (
            <div key={acc.id} className="bg-[#141414] border border-[#222] p-6 rounded-2xl flex flex-col gap-4 group relative">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#1a1a1a] rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform overflow-hidden">
                    {acc.imageUrl ? (
                      <img src={acc.imageUrl} alt={acc.name} className="w-full h-full object-cover" />
                    ) : (
                      <Monitor className="w-5 h-5 text-orange-500" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                       <h4 className="text-white font-bold">{acc.name}</h4>
                       <button onClick={() => setEditingAccount(acc)} className="text-gray-600 hover:text-white transition-colors">
                         <Pencil className="w-3 h-3" />
                       </button>
                    </div>
                    <p className="text-xs text-gray-500">{acc.platform}</p>
                  </div>
                </div>
                <div className="relative">
                  <button 
                    onClick={() => setActiveMenuId(activeMenuId === acc.id ? null : acc.id)}
                    className="p-2 text-gray-500 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-[#1a1a1a]"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  
                  <AnimatePresence>
                    {activeMenuId === acc.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setActiveMenuId(null)} />
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -10 }}
                          className="absolute right-0 mt-2 w-48 bg-[#1a1a1a] border border-[#222] rounded-xl shadow-2xl z-20 overflow-hidden"
                        >
                          <button 
                            onClick={() => openLinkModal(acc)}
                            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-300 hover:bg-orange-500/10 hover:text-orange-500 transition-colors border-b border-[#222]"
                          >
                            <Calendar className="w-4 h-4" />
                            Vincular Produto
                          </button>
                          <button 
                            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                            onClick={() => {
                              handleDelete(acc.id);
                              setActiveMenuId(null);
                            }}
                          >
                            <AlertTriangle className="w-4 h-4" />
                            Excluir Conta
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              
              <div className="flex gap-2">
                <StatusBadge status={acc.status} />
                <StageBadge stage={acc.stage} />
              </div>

              <div className="mt-2 space-y-2">
                {acc.linkedProductIds && acc.linkedProductIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {acc.linkedProductIds.map(pid => {
                      const p = products.find(prod => prod.id === pid);
                      return p ? (
                        <span key={pid} className="text-[10px] bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded border border-orange-500/20 flex items-center gap-1">
                          {p.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
                <div className="text-[11px] text-gray-400 flex justify-between items-center bg-[#0a0a0a] p-2 rounded-xl border border-[#222]">
                  <span>Videos diários:</span>
                  <input 
                    type="number"
                    className="bg-transparent border-none text-right text-white font-mono font-bold w-16 outline-none focus:text-orange-500"
                    value={acc.productionFrequency}
                    onChange={async (e) => {
                      try {
                        await updateDoc(doc(db, 'accounts', acc.id), { productionFrequency: parseInt(e.target.value) || 0 });
                      } catch (err) {
                        handleFirestoreError(err, OperationType.UPDATE, `accounts/${acc.id}`);
                      }
                    }}
                  />
                </div>
                <div className="text-[11px] text-gray-400 flex justify-between items-center bg-[#0a0a0a] p-2 rounded-xl border border-[#222]">
                  <span>Pontuação Atual:</span>
                  <input 
                    type="number"
                    className="bg-transparent border-none text-right text-white font-mono font-bold w-16 outline-none focus:text-orange-500"
                    value={acc.healthPoints}
                    onChange={async (e) => {
                      try {
                        await updateDoc(doc(db, 'accounts', acc.id), { healthPoints: parseInt(e.target.value) || 0 });
                      } catch (err) {
                        handleFirestoreError(err, OperationType.UPDATE, `accounts/${acc.id}`);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button 
                  onClick={async () => {
                    const newStatus = acc.status === AccountStatus.ACTIVE ? AccountStatus.PAUSED : AccountStatus.ACTIVE;
                    try {
                      await updateDoc(doc(db, 'accounts', acc.id), { status: newStatus });
                    } catch (e) {
                      handleFirestoreError(e, OperationType.UPDATE, `accounts/${acc.id}`);
                    }
                  }}
                  className={`flex-1 text-[10px] py-2 border rounded-lg transition-all uppercase font-bold tracking-wider ${
                    acc.status === AccountStatus.ACTIVE 
                      ? 'bg-[#1a1a1a] border-[#222] text-gray-400 hover:text-white' 
                      : 'bg-green-500/10 border-green-500/20 text-green-500 hover:bg-green-500/20'
                  }`}
                >
                  {acc.status === AccountStatus.ACTIVE ? 'Pausar' : 'Ativar'}
                </button>
                <button 
                  onClick={async () => {
                     const nextStage = acc.stage === AccountStage.TESTING ? AccountStage.SCALING : acc.stage === AccountStage.SCALED;
                     try {
                       await updateDoc(doc(db, 'accounts', acc.id), { stage: nextStage });
                     } catch (e) {
                       handleFirestoreError(e, OperationType.UPDATE, `accounts/${acc.id}`);
                     }
                  }}
                  className="flex-1 text-[10px] py-2 bg-[#1a1a1a] border border-[#222] text-gray-400 hover:text-white rounded-lg uppercase font-bold tracking-wider"
                >
                  Escalar
                </button>
              </div>
            </div>
          ))}
          {accounts.length === 0 && (
            <div className="col-span-full py-12 text-center bg-[#141414] border-2 border-dashed border-[#222] rounded-2xl">
              <p className="text-gray-500">Nenhuma conta encontrada.</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Linking Modal */}
      <AnimatePresence>
        {linkingAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setLinkingAccount(null)} 
              className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#141414] border border-[#222] w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl relative z-10"
            >
              <div className="p-6 border-b border-[#222] flex items-center justify-between">
                <div>
                  <h3 className="text-white font-bold">Vincular Produtos</h3>
                  <p className="text-xs text-gray-500">Conta: {linkingAccount.name}</p>
                </div>
                <button onClick={() => setLinkingAccount(null)} className="text-gray-500 hover:text-white">
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input 
                    placeholder="Buscar produto..."
                    className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl pl-10 pr-4 py-2 text-white outline-none focus:border-orange-500"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                
                <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(p => {
                    const isLinked = tempLinkedIds.includes(p.id);
                    const wasInitiallyLinked = initialLinkedIds.includes(p.id);
                    const isNewlyModified = isLinked !== wasInitiallyLinked;
                    
                    return (
                      <button 
                        key={p.id}
                        onClick={() => toggleProductLink(p.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all relative overflow-hidden group ${
                          isLinked 
                            ? isNewlyModified 
                              ? 'bg-orange-500/5 border-orange-500/40 border-dashed animate-pulse' 
                              : 'bg-orange-500/10 border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.1)]' 
                            : wasInitiallyLinked
                              ? 'bg-red-500/5 border-red-500/20 opacity-60'
                              : 'bg-[#0a0a0a] border-[#222] hover:border-gray-700'
                        }`}
                      >
                        {isLinked && !isNewlyModified && (
                          <motion.div 
                            layoutId="active-bg"
                            className="absolute inset-0 bg-orange-500/5 pointer-events-none"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                          />
                        )}
                        
                        <div className="flex min-w-0 items-center gap-3 text-left relative z-10">
                          <div className={`w-11 h-11 rounded-xl overflow-hidden border flex items-center justify-center shrink-0 transition-colors ${
                            isLinked
                              ? isNewlyModified ? 'bg-orange-500/10 border-orange-500/40' : 'bg-orange-500/10 border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.25)]'
                              : 'bg-[#1a1a1a] border-[#222] group-hover:border-gray-700'
                          }`}>
                            {p.imageUrl ? (
                              <img
                                src={p.imageUrl}
                                alt={p.name}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <Hash className={`w-4 h-4 transition-colors ${isLinked ? 'text-orange-400' : 'text-gray-500 group-hover:text-gray-300'}`} />
                            )}
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <div className="flex min-w-0 items-center gap-2">
                              <p className={`text-sm font-bold transition-colors truncate ${isLinked ? 'text-white' : 'text-gray-400'}`}>{p.name}</p>
                              {isNewlyModified && isLinked && (
                                <span className="shrink-0 text-[8px] bg-orange-500 text-black px-1 rounded font-black uppercase">Novo</span>
                              )}
                              {wasInitiallyLinked && !isLinked && (
                                <span className="shrink-0 text-[8px] bg-red-500 text-white px-1 rounded font-black uppercase">Removendo</span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-500 uppercase font-black tracking-wider truncate">{p.category || 'Sem categoria'}</p>
                          </div>
                        </div>
                        
                        <div className="relative z-10">
                          {isLinked ? (
                            <motion.div
                              initial={{ scale: 0, rotate: -45 }}
                              animate={{ scale: 1, rotate: 0 }}
                              className={`${isNewlyModified ? 'bg-orange-500/40' : 'bg-orange-500'} rounded-full p-1 shadow-[0_0_10px_rgba(249,115,22,0.5)]`}
                            >
                              <CheckCircle2 className={`w-4 h-4 ${isNewlyModified ? 'text-white' : 'text-black'}`} />
                            </motion.div>
                          ) : (
                            <div className={`w-6 h-6 rounded-full border-2 transition-colors ${wasInitiallyLinked ? 'border-red-500/50' : 'border-[#222] group-hover:border-gray-700'}`} />
                          )}
                        </div>
                      </button>
                    );
                  })}
                  {products.length === 0 && (
                    <div className="py-8 text-center text-gray-600 italic text-sm">Nenhum produto na base</div>
                  )}
                </div>
              </div>
              
              <div className="p-6 bg-[#0c0c0c] border-t border-[#222] flex gap-3">
                <button 
                  onClick={() => setLinkingAccount(null)}
                  className="flex-1 bg-[#1a1a1a] text-gray-400 py-3 rounded-xl font-bold hover:bg-[#222] hover:text-white transition-colors border border-[#222]"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleSaveLinks}
                  disabled={tempLinkedIds.length === initialLinkedIds.length && tempLinkedIds.every(id => initialLinkedIds.includes(id))}
                  className={`flex-1 py-3 rounded-xl font-bold transition-all ${
                    tempLinkedIds.length === initialLinkedIds.length && tempLinkedIds.every(id => initialLinkedIds.includes(id))
                      ? 'bg-[#1a1a1a] text-gray-600 cursor-not-allowed border border-[#222]'
                      : 'bg-orange-500 text-black hover:bg-orange-400 shadow-[0_0_20px_rgba(249,115,22,0.2)]'
                  }`}
                >
                  Salvar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Editing Modal */}
      <AnimatePresence>
        {editingAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setEditingAccount(null)} 
              className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#141414] border border-[#222] w-full max-w-md rounded-3xl overflow-hidden shadow-2xl relative z-10"
            >
              <div className="p-6 border-b border-[#222] flex items-center justify-between">
                <h3 className="text-white font-bold">Editar Perfil da Conta</h3>
                <button onClick={() => setEditingAccount(null)} className="text-gray-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="flex justify-center">
                  <div className="relative group/photo">
                    <div className="w-24 h-24 bg-[#0a0a0a] border-2 border-[#222] rounded-2xl overflow-hidden flex items-center justify-center">
                      {editingAccount.imageUrl ? (
                        <img src={editingAccount.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <Camera className="w-8 h-8 text-gray-700" />
                      )}
                    </div>
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl pointer-events-none">
                       <Pencil className="w-5 h-5 text-white" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Nome da Conta</label>
                    <input 
                      placeholder="Nome da conta"
                      className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl px-4 py-3 text-white outline-none focus:border-orange-500 transition-colors"
                      value={editingAccount.name}
                      onChange={e => setEditingAccount({...editingAccount, name: e.target.value})}
                    />
                  </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Logo da Conta</label>
                  <div className="flex items-center gap-4 p-4 bg-[#0a0a0a] border border-[#222] rounded-2xl">
                    <div className="w-16 h-16 rounded-full bg-[#141414] border border-[#222] overflow-hidden flex items-center justify-center shrink-0 group relative cursor-pointer" onClick={() => editFileInputRef.current?.click()}>
                      {editingAccount.imageUrl ? (
                        <img src={editingAccount.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <Camera className="w-8 h-8 text-gray-700" />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full pointer-events-none">
                         <Pencil className="w-5 h-5 text-white" />
                      </div>
                    </div>
                    <div className="flex-1">
                       <input 
                         type="file" 
                         accept="image/*" 
                         className="hidden" 
                         ref={editFileInputRef}
                         onChange={(e) => handleFileChange(e, true)}
                       />
                       <button 
                         onClick={() => editFileInputRef.current?.click()}
                         className="w-full py-2 bg-[#1a1a1a] border border-[#222] text-gray-400 font-bold text-[10px] uppercase rounded-lg hover:text-white transition-colors"
                       >
                         Alterar Foto
                       </button>
                       {editingAccount.imageUrl && (
                         <button 
                           onClick={() => setEditingAccount({...editingAccount, imageUrl: ''})}
                           className="w-full mt-2 py-1.5 bg-red-500/10 border border-red-500/20 text-red-500 font-bold text-[9px] uppercase rounded-lg hover:bg-red-500/20 transition-colors"
                         >
                           Remover Foto
                         </button>
                       )}
                    </div>
                  </div>
                </div>
                </div>
              </div>
              
              <div className="p-6 bg-[#0c0c0c] border-t border-[#222] flex gap-3">
                <button 
                  onClick={() => setEditingAccount(null)}
                  className="flex-1 bg-[#1a1a1a] text-gray-400 py-3 rounded-xl font-bold hover:bg-[#222] hover:text-white transition-colors border border-[#222]"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleUpdateAccount}
                  className="flex-1 bg-orange-500 text-black py-3 rounded-xl font-bold hover:bg-orange-400 transition-all shadow-[0_0_20px_rgba(249,115,22,0.2)]"
                >
                  Salvar Alterações
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WinningStatusBadge({ status }: { status: WinningStatus }) {
  const config = {
    [WinningStatus.TESTING]: { label: 'Teste', className: 'bg-blue-400/10 text-blue-400 border-blue-400/20' },
    [WinningStatus.POTENTIAL]: { label: 'Validando', className: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20' },
    [WinningStatus.WINNER]: { label: 'Validado', className: 'bg-green-400/10 text-green-400 border-green-400/20' },
    [WinningStatus.SCALED]: { label: 'Escala', className: 'bg-orange-400/10 text-orange-400 border-orange-400/20 shadow-[0_0_10px_rgba(251,146,60,0.1)]' },
  };
  const { label, className } = config[status] || { label: status, className: 'bg-gray-500/10 text-gray-500' };
  return (
    <span className={`text-[9px] md:text-[10px] uppercase font-black px-2 py-0.5 md:py-1 rounded-full border ${className} whitespace-nowrap`}>
      {label}
    </span>
  );
}

function Production({ schedule, accounts, products, producers, userProfiles, user, profile, isPartner, subView, viewMode, driveAccessToken, setDriveAccessToken, driveConfigured, activeProducerId, setActiveProducerId, activeProductId, setActiveProductId, setActiveTab, sales = [], tiktokLinks = [] }: { schedule: ScheduleItem[], accounts: Account[], products: Product[], producers: Producer[], userProfiles: UserProfile[], user: FirebaseUser, profile: UserProfile | null, isPartner: boolean, subView: 'editors' | 'suppliers' | 'line' | 'library', viewMode: ViewMode, driveAccessToken: string | null, setDriveAccessToken: (token: string | null) => void, driveConfigured: boolean, activeProducerId: string | null, setActiveProducerId: (id: string | null) => void, activeProductId: string | null, setActiveProductId: (id: string | null) => void, setActiveTab?: (tab: string) => void, sales?: Sale[], tiktokLinks?: TiktokLink[] }) {
  const [activeRole, setActiveRole] = useState<'editor' | 'supplier' | null>(null);
  const [showAddProducer, setShowAddProducer] = useState(false);
  const [newProducerName, setNewProducerName] = useState('');

  const videoDisplayNames = useMemo(() => {
    const counts: Record<string, number> = {};
    const result: Record<string, string> = {};

    const sortedAll = [...schedule]
      .filter(s => s.status === ScheduleStatus.POSTED)
      .sort((a, b) => a.date.localeCompare(b.date));

    sortedAll.forEach(v => {
      const key = `${v.accountId}_${v.date}`;
      counts[key] = (counts[key] || 0) + 1;
      
      const dateParts = v.date.split('-');
      const displayDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}` : v.date;
      
      result[v.id] = `${displayDate} nº ${counts[key]}`;
    });

    return result;
  }, [schedule]);
  
  // Management states
  const [editingProducer, setEditingProducer] = useState<Producer | null>(null);
  const [editingProducerRole, setEditingProducerRole] = useState<'editor' | 'supplier'>('editor');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState<Producer | null>(null);
  const [linkEmail, setLinkEmail] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  
  // Modals for workflow
  const [prepModal, setPrepModal] = useState<{ productId: string, producerId: string } | null>(null);
  const [completionModal, setCompletionModal] = useState<{ productId: string, producerId: string } | null>(null);
  const [showAddLineItem, setShowAddLineItem] = useState(false);
  const [uploadingItem, setUploadingItem] = useState<{ id: string, type: string } | null>(null);
  
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const finishedInputRef = useRef<HTMLInputElement>(null);
  
  const [activeUploadContext, setActiveUploadContext] = useState<{ id: string, type: 'audio' | 'video' | 'finished' } | null>(null);
  
  // Form states
  const [prepData, setPrepData] = useState({ audio: '', video: '', notes: '' });
  const [finishedVideoData, setFinishedVideoData] = useState({ url: '', accountId: '' });
  const [activePreviewVideo, setActivePreviewVideo] = useState<{ url: string; name: string; type?: 'audio' | 'video' } | null>(null);
  const [newItemData, setNewItemData] = useState({ accountId: '', productId: '', producerId: '', supplierId: '' });
  const [pendingReferenceLink, setPendingReferenceLink] = useState<TiktokLink | null>(null);
  const [productionEditorSelections, setProductionEditorSelections] = useState<Record<string, string>>({});

  // Library States
  const [libraryTypeFilter, setLibraryTypeFilter] = useState<'all' | 'audio' | 'video' | 'finished'>('all');
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');

  const todayStr = getLocalDateString();
  const pendingProduction = schedule.filter(s => s.status !== ScheduleStatus.POSTED && s.date === todayStr);

  const linkedProducer = producers.find(p => isProducerLinkedToUser(p, user));
  const userRole = getProducerLinkedRole(linkedProducer);
  const pendingReferenceStorageKey = linkedProducer ? `pending_reference_link_${viewMode || 'PERSONAL'}_${linkedProducer.id}` : null;
  const activePendingReferenceLink = pendingReferenceLink || findPendingSupplierLink(tiktokLinks, pendingReferenceStorageKey ? localStorage.getItem(pendingReferenceStorageKey) : null, linkedProducer?.id) || null;

  useEffect(() => {
    if (!pendingReferenceStorageKey || pendingReferenceLink) return;
    const storedId = localStorage.getItem(pendingReferenceStorageKey);
    const storedLink = findPendingSupplierLink(tiktokLinks, storedId, linkedProducer?.id);
    if (storedLink) {
      setPendingReferenceLink(storedLink);
    } else if (storedId && tiktokLinks.some(lnk => lnk.id === storedId && (lnk.scheduleItemId || (lnk as any).consumedAt))) {
      localStorage.removeItem(pendingReferenceStorageKey);
    }
  }, [pendingReferenceStorageKey, pendingReferenceLink, tiktokLinks, linkedProducer?.id]);

  const isSupplierDone = (item: ScheduleItem) => {
    const hasAudio = Array.isArray(item.audioMaterial) ? item.audioMaterial.length > 0 : !!item.audioMaterial;
    const hasVideo = Array.isArray(item.videoMaterial) ? item.videoMaterial.length > 0 : !!item.videoMaterial;
    const isCompletedStatus = item.status === ScheduleStatus.PRODUCED || item.status === ScheduleStatus.POSTED;
    return (hasAudio && hasVideo) || isCompletedStatus;
  };

  const handleLinkUser = async () => {
    if (!showLinkModal || !selectedProfile) return;
    
    try {
      const targetUserId = selectedProfile.uid;
      const targetUserEmail = selectedProfile.email;
      const targetRole: 'editor' | 'supplier' = subView === 'suppliers' ? 'supplier' : 'editor';

      const existingActiveLink = producers.find(p => {
        if (p.id === showLinkModal.id || p.hidden) return false;
        const linkedId = getProducerLinkedUserId(p);
        const linkedEmail = getProducerLinkedEmail(p);
        return linkedId === targetUserId ||
          (!!linkedId && !!linkedEmail && linkedEmail.toLowerCase() === targetUserEmail.toLowerCase());
      });

      if (existingActiveLink) {
        alert(`Este usuário já está vinculado ao colaborador ${existingActiveLink.name}. Desvincule esse colaborador antes de criar um novo vínculo.`);
        return;
      }

      const staleEmailOnlyLinks = producers.filter(p => {
        if (p.id === showLinkModal.id) return false;
        const linkedId = getProducerLinkedUserId(p);
        const linkedEmail = getProducerLinkedEmail(p);
        return !linkedId && !!linkedEmail && linkedEmail.toLowerCase() === targetUserEmail.toLowerCase();
      });

      for (const staleProducer of staleEmailOnlyLinks) {
        await updateDoc(doc(db, 'producers', staleProducer.id), {
          linkedUserEmail: null,
          linkedEmail: null,
          collaboratorEmail: null,
          editorEmail: null,
          supplierEmail: null,
          collaboratorUserId: null,
          editorUserId: null,
          supplierUserId: null,
          linkedAt: null,
          updatedAt: serverTimestamp()
        });
      }
      
      await updateDoc(doc(db, 'producers', showLinkModal.id), {
        role: targetRole,
        linkedUserId: targetUserId,
        linkedUserEmail: targetUserEmail,
        linkedEmail: targetUserEmail,
        collaboratorEmail: targetUserEmail,
        editorEmail: targetRole === 'editor' ? targetUserEmail : null,
        supplierEmail: targetRole === 'supplier' ? targetUserEmail : null,
        collaboratorUserId: targetUserId,
        editorUserId: targetRole === 'editor' ? targetUserId : null,
        supplierUserId: targetRole === 'supplier' ? targetUserId : null,
        linkedAt: new Date().toISOString(),
        updatedAt: serverTimestamp()
      });

      await setDoc(doc(db, 'user_profiles', selectedProfile.id), {
        role: selectedProfile.role || UserRole.EMPLOYEE,
        producerRole: targetRole,
        collaboratorRole: targetRole,
        producerId: showLinkModal.id,
        collaboratorId: showLinkModal.id,
        editorId: targetRole === 'editor' ? showLinkModal.id : null,
        supplierId: targetRole === 'supplier' ? showLinkModal.id : null,
        permissions: {
          production: true,
          contentVault: true,
          editor: targetRole === 'editor',
          supplier: targetRole === 'supplier'
        },
        updatedAt: serverTimestamp()
      }, { merge: true });

      const savedProducerSnap = await getDoc(doc(db, 'producers', showLinkModal.id));
      const savedProducer = savedProducerSnap.data();
      if (!savedProducer?.linkedUserId || savedProducer.linkedUserId !== targetUserId || savedProducer.role !== targetRole) {
        throw new Error('O vinculo nao foi confirmado no Firestore.');
      }

      console.log('[Production Link User] Saved collaborator link:', {
        producerId: showLinkModal.id,
        producerName: showLinkModal.name,
        targetUserId,
        targetUserEmail,
        targetRole
      });
      
      setShowLinkModal(null);
      setLinkEmail('');
      setSelectedProfile(null);
    } catch (err: any) {
      alert('Erro ao vincular usuário: ' + err.message);
    }
  };
  
  const handleUnlinkUser = async (producer: Producer) => {
    const linkedUserId = getProducerLinkedUserId(producer);
    const linkedEmail = getProducerLinkedEmail(producer);
    const linkedProfile = userProfiles.find(profile =>
      (linkedUserId && profile.uid === linkedUserId) ||
      (!!linkedEmail && profile.email.toLowerCase() === linkedEmail.toLowerCase())
    );
    const profileId = linkedProfile?.id || (linkedUserId ? `${linkedUserId}_${viewMode || 'PERSONAL'}` : null);

    if (!linkedUserId && !linkedEmail) return;
    if (!confirm(`Desvincular ${linkedEmail || 'este usuário'} de ${producer.name}?`)) return;

    try {
      await updateDoc(doc(db, 'producers', producer.id), {
        linkedUserId: null,
        linkedUserEmail: null,
        linkedEmail: null,
        collaboratorEmail: null,
        editorEmail: null,
        supplierEmail: null,
        collaboratorUserId: null,
        editorUserId: null,
        supplierUserId: null,
        role: null,
        linkedAt: null,
        updatedAt: serverTimestamp()
      });

      const hasOtherActiveLink = producers.some(p => {
        if (p.id === producer.id || p.hidden) return false;
        const otherId = getProducerLinkedUserId(p);
        const otherEmail = getProducerLinkedEmail(p);
        return (!!linkedUserId && otherId === linkedUserId) ||
          (!!otherId && !!linkedEmail && !!otherEmail && otherEmail.toLowerCase() === linkedEmail.toLowerCase());
      });

      if (profileId && !hasOtherActiveLink) {
        await setDoc(doc(db, 'user_profiles', profileId), {
          producerRole: null,
          collaboratorRole: null,
          producerId: null,
          collaboratorId: null,
          editorId: null,
          supplierId: null,
          permissions: {
            production: false,
            contentVault: false,
            editor: false,
            supplier: false
          },
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      setMenuOpenId(null);
      console.log('[Production Unlink User] Removed collaborator link:', {
        producerId: producer.id,
        producerName: producer.name,
        linkedUserId,
        linkedEmail
      });
    } catch (err: any) {
      alert('Erro ao desvincular usuário: ' + err.message);
    }
  };

  const currentProducer = producers.find(p => p.id === activeProducerId);
  const currentProduct = products.find(p => p.id === activeProductId);

  const handleAddProducer = async () => {
    if (!newProducerName.trim()) return;
    try {
      const role = subView === 'suppliers' ? 'supplier' : 'editor';
      await addDoc(collection(db, 'producers'), {
        name: newProducerName.trim(),
        userId: user.uid,
        scope: viewMode || 'PERSONAL',
        role,
        hidden: false,
        createdAt: serverTimestamp()
      });
      setNewProducerName('');
      setShowAddProducer(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'producers');
    }
  };

  const handleRenameProducer = async () => {
    if (!editingProducer || !newProducerName.trim()) return;
    try {
      await updateDoc(doc(db, 'producers', editingProducer.id), { 
        name: newProducerName.trim(),
        role: editingProducerRole
      });
      setEditingProducer(null);
      setNewProducerName('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `producers/${editingProducer.id}`);
    }
  };

  const toggleHideProducer = async (producer: Producer) => {
    try {
      await updateDoc(doc(db, 'producers', producer.id), { hidden: !producer.hidden });
      setMenuOpenId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `producers/${producer.id}`);
    }
  };

  const handleDeleteProducer = async (id: string) => {
    if (!confirm('Deseja realmente remover este editor? Todos os vínculos serão mantidos, mas o editor não aparecerá na lista.')) return;
    try {
      await deleteDoc(doc(db, 'producers', id));
      setMenuOpenId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `producers/${id}`);
    }
  };

  const handleAssignRole = async (itemId: string, producerId: string, role: 'editor' | 'supplier') => {
    try {
      const field = role === 'supplier' ? 'supplierId' : 'producerId';
      await updateDoc(doc(db, 'schedule', itemId), { [field]: producerId });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `schedule/${itemId}`);
    }
  };

  const hasAnyMaterial = (item: ScheduleItem) => hasEditableMaterial(item);

  const handleUploadFile = async (itemId: string, type: 'audio' | 'video' | 'finished', file: File) => {
    setUploadingItem({ id: itemId, type });
    try {
      let targetItemId = itemId;
      let item = schedule.find(s => s.id === itemId);
      const shouldRequireReference = userRole === 'supplier' && (type === 'audio' || type === 'video');
      let referenceLinkToConsume = shouldRequireReference ? activePendingReferenceLink : null;

      if (itemId === 'virtual-draft-item') {
        const selectedEditorId = productionEditorSelections[itemId] || (activeProducerId === 'unassigned' ? '' : (activeProducerId || ''));
        const blockMessages = shouldRequireReference
          ? getSupplierUploadBlockMessages(!!referenceLinkToConsume, !!selectedEditorId)
          : [];
        if (blockMessages.length > 0) {
          alert(blockMessages.join('\n'));
          return;
        }
        const alreadyNumberedItems = schedule.filter(s => s.date === todayStr && s.dailyIndex && ( (Array.isArray(s.audioMaterial) && s.audioMaterial.length > 0) || (Array.isArray(s.videoMaterial) && s.videoMaterial.length > 0) ));
        const maxIndex = alreadyNumberedItems.reduce((max, s) => Math.max(max, s.dailyIndex || 0), 0);
        const dIndex = maxIndex + 1;

        const docRef = await addDoc(collection(db, 'schedule'), {
          date: todayStr,
          accountId: null,
          productId: activeProductId || '',
          producerId: selectedEditorId || null,
          supplierId: linkedProducer?.id || null,
          status: ScheduleStatus.PLANNED,
          userId: user.uid,
          scope: viewMode || 'PERSONAL',
          dailyIndex: dIndex,
          productionCode: buildProductionCode({ date: todayStr, accountId: '', productId: activeProductId || '', dailyIndex: dIndex }, accounts, products, schedule),
          createdAt: serverTimestamp(),
          audioMaterial: [],
          videoMaterial: [],
          finishedVideoUrl: []
        });
        
        targetItemId = docRef.id;
        item = {
          id: targetItemId,
          userId: user.uid,
          date: todayStr,
          accountId: '',
          productId: activeProductId || '',
          producerId: selectedEditorId,
          supplierId: linkedProducer?.id || '',
          status: ScheduleStatus.PLANNED,
          audioMaterial: [],
          videoMaterial: [],
          finishedVideoUrl: [],
          dailyIndex: dIndex,
          productionCode: buildProductionCode({ date: todayStr, accountId: '', productId: activeProductId || '', dailyIndex: dIndex }, accounts, products, schedule)
        };
      }

      if (!item) return;
      if (shouldRequireReference) {
        const effectiveProducerId = productionEditorSelections[targetItemId] || item.producerId;
        const blockMessages = getSupplierUploadBlockMessages(!!item.creatorLinkId || !!referenceLinkToConsume, !!effectiveProducerId);
        if (blockMessages.length > 0) {
          alert(blockMessages.join('\n'));
          return;
        }
      }

      let dIndex = item.dailyIndex;
      const hasNoMaterialsYet = (!item.audioMaterial || item.audioMaterial.length === 0) && (!item.videoMaterial || item.videoMaterial.length === 0);
      if (hasNoMaterialsYet || !dIndex) {
        const alreadyNumberedItems = schedule.filter(s => s.date === todayStr && s.dailyIndex && ( (Array.isArray(s.audioMaterial) && s.audioMaterial.length > 0) || (Array.isArray(s.videoMaterial) && s.videoMaterial.length > 0) ));
        const maxIndex = alreadyNumberedItems.reduce((max, s) => Math.max(max, s.dailyIndex || 0), 0);
        dIndex = maxIndex + 1;
        await updateDoc(doc(db, 'schedule', targetItemId), { dailyIndex: dIndex });
        item = { ...item, dailyIndex: dIndex };
      }

      const product = products.find(p => p.id === item.productId);
      const folderName = product ? `Influency_${product.name}` : 'Influency_Assets';
      
      // 1. Get or create folder via Server Proxy
      const folderRes = await fetch('/api/drive/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderName })
      });
      
      let folderData;
      const folderContentType = folderRes.headers.get("content-type");
      if (folderContentType && folderContentType.includes("application/json")) {
        folderData = await folderRes.json();
      } else {
        const text = await folderRes.text();
        console.error("Non-JSON response from folder creation:", text);
        throw new Error(`Erro no servidor (Status ${folderRes.status}). ${text.substring(0, 100)}`);
      }
      
      if (!folderRes.ok) {
        if (folderData.error?.includes("não configurado")) {
          if (isPartner) {
            if (confirm("O Google Drive Global não está configurado. Deseja configurar agora para que todos possam fazer upload?")) {
              const authRes = await fetch(`/api/drive/auth-url`);
              const authData = await authRes.json();
              window.location.href = authData.url;
              return;
            }
          } else {
            throw new Error("O Google Drive não foi configurado pelo administrador. Peça ao proprietário para vincular o Drive Global.");
          }
        }
        throw new Error(folderData.error || "Google Drive não configurado.");
      }
      const folderId = folderData.id;

      // 2. Upload file via Server Proxy
      const paddedIndex = String(dIndex).padStart(3, '0');
      const extension = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '';
      const baseFileName = type === 'finished' ? `Vídeo pronto ${paddedIndex}` : paddedIndex;
      const finalName = baseFileName + extension;
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('parentId', folderId);
      formData.append('fileName', finalName);

      const uploadResponse = await fetch('/api/drive/upload', {
        method: 'POST',
        body: formData
      });

      let driveFile;
      const uploadContentType = uploadResponse.headers.get("content-type");
      if (uploadContentType && uploadContentType.includes("application/json")) {
        driveFile = await uploadResponse.json();
      } else {
        const text = await uploadResponse.text();
        console.error("Non-JSON response from upload:", text);
        throw new Error(`Erro no upload (Status ${uploadResponse.status}). ${text.substring(0, 100)}`);
      }

      if (!uploadResponse.ok) {
        throw new Error(driveFile.error || "Erro no upload do servidor.");
      }
      const url = driveFile.webViewLink;
      const savedName = driveFile.name || finalName;
      
      const field = type === 'audio' ? 'audioMaterial' : type === 'video' ? 'videoMaterial' : 'finishedVideoUrl';
      const updates: any = { [field]: arrayUnion({ url, name: savedName }) };
      
      if (type === 'finished') {
        updates.status = ScheduleStatus.PRODUCED;
        updates.producedAt = new Date().toISOString();
      } else {
        updates.materialAddedAt = new Date().toISOString();
        if (!item.status || item.status === ScheduleStatus.PLANNED) {
          updates.status = ScheduleStatus.EDITING;
        }

        if (!item.productionCode) {
          updates.productionCode = buildProductionCode(item, accounts, products, schedule);
        }

        if (userRole === 'supplier') {
          const alreadyLinkedReference = item.creatorLinkId
            ? tiktokLinks.find(lnk => lnk.id === item.creatorLinkId)
            : undefined;
          const referenceLink = alreadyLinkedReference || referenceLinkToConsume;

          if (referenceLink) {
            updates.creatorHandle = resolveCreatorHandle(item, referenceLink, accounts);
            updates.creatorLinkId = referenceLink.id;
            updates.sourceVideoLink = referenceLink.link;
            updates.videoLink = referenceLink.link;
            try {
              await updateDoc(doc(db, 'tiktok_links', referenceLink.id), {
                scheduleItemId: targetItemId,
                supplierId: linkedProducer.id,
                usedAt: new Date().toISOString(),
                consumedAt: new Date().toISOString(),
                associatedAt: new Date().toISOString()
              });
              if (!alreadyLinkedReference) {
                setPendingReferenceLink(null);
                if (pendingReferenceStorageKey) localStorage.removeItem(pendingReferenceStorageKey);
              }
            } catch (linkError) {
              console.error("Failed to associate link doc:", linkError);
            }
          }
        }
      }

      await updateDoc(doc(db, 'schedule', targetItemId), updates);
    } catch (err: any) {
      console.error('Upload error:', err);
      alert(`Erro no upload: ${err.message}`);
    } finally {
      setUploadingItem(null);
    }
  };

  const handleUpdateAsset = async (itemId: string, type: 'audio' | 'video' | 'finished', url: string) => {
    if (!url) return;
    try {
      const field = type === 'audio' ? 'audioMaterial' : type === 'video' ? 'videoMaterial' : 'finishedVideoUrl';
      const updates: any = { [field]: arrayUnion({ url, name: 'Link Externo' }) };
      if (type === 'finished') {
        updates.status = ScheduleStatus.PRODUCED;
        updates.producedAt = new Date().toISOString();
      }
      await updateDoc(doc(db, 'schedule', itemId), updates);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `schedule/${itemId}`);
    }
  };

  const getProductGroupsForProducer = (producerId: string) => {
    const producer = producers.find(p => p.id === producerId);
    const producerTasks = pendingProduction.filter(s => s.producerId === producerId);
    const historicalProducerTasks = userRole === 'editor'
      ? schedule.filter(s => s.producerId === producerId)
      : [];
    const groups: Record<string, { product: Product, items: ScheduleItem[] }> = {};
    
    // 1. Populate groups with explicitly linked products
    if (producer && Array.isArray(producer.linkedProductIds)) {
      producer.linkedProductIds.forEach(pId => {
        const prod = products.find(p => p.id === pId);
        if (prod) {
          groups[pId] = { product: prod, items: [] };
        }
      });
    }

    historicalProducerTasks.forEach(item => {
      if (!groups[item.productId]) {
        const prod = products.find(p => p.id === item.productId);
        if (prod) {
          groups[item.productId] = { product: prod, items: [] };
        }
      }
    });
    
    // 2. Add any other products found in tasks, and populate tasks
    producerTasks.forEach(item => {
      if (!groups[item.productId]) {
        const prod = products.find(p => p.id === item.productId);
        if (prod) {
          groups[item.productId] = { product: prod, items: [] };
        }
      }
      if (groups[item.productId]) {
        groups[item.productId].items.push(item);
      }
    });
    
    return Object.values(groups);
  };

  const handleSavePrep = async () => {
    if (!prepModal) return;
    const itemsToUpdate = pendingProduction.filter(s => 
      s.producerId === prepModal.producerId && 
      s.productId === prepModal.productId
    );

    try {
      const batchPromises = itemsToUpdate.map(item => 
        updateDoc(doc(db, 'schedule', item.id), {
          audioMaterial: prepData.audio ? prepData.audio.split(',').map(s => s.trim()).filter(Boolean).map(url => ({ url, name: 'Link Manual' })) : [],
          videoMaterial: prepData.video ? prepData.video.split(',').map(s => s.trim()).filter(Boolean).map(url => ({ url, name: 'Link Manual' })) : [],
          productionNotes: prepData.notes,
          materialAddedAt: serverTimestamp()
        })
      );
      await Promise.all(batchPromises);
      setPrepModal(null);
      setPrepData({ audio: '', video: '', notes: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'schedule/prep');
    }
  };

  const handleCompleteVideo = async () => {
    if (!completionModal || !finishedVideoData.accountId || !finishedVideoData.url) return;
    
    const item = pendingProduction.find(s => 
      s.producerId === completionModal.producerId && 
      s.productId === completionModal.productId &&
      s.accountId === finishedVideoData.accountId
    );

    if (!item) return;

    try {
      await updateDoc(doc(db, 'schedule', item.id), {
        status: ScheduleStatus.PRODUCED,
        finishedVideoUrl: arrayUnion({ url: finishedVideoData.url, name: 'Vídeo Finalizado' }),
        producedAt: serverTimestamp()
      });
      setCompletionModal(null);
      setFinishedVideoData({ url: '', accountId: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `schedule/${item.id}`);
    }
  };

  const handleAddItem = async () => {
    if (!newItemData.productId) return;
    try {
      if (newItemData.producerId) {
        // If producerId is present, we are inside an editor's folder and linking a product to them
        const producer = producers.find(p => p.id === newItemData.producerId);
        if (producer) {
          const currentLinked = Array.isArray(producer.linkedProductIds) ? [...producer.linkedProductIds] : [];
          if (!currentLinked.includes(newItemData.productId)) {
            currentLinked.push(newItemData.productId);
            await updateDoc(doc(db, 'producers', producer.id), {
              linkedProductIds: currentLinked
            });
          }
          setShowAddLineItem(false);
          setActiveProductId(newItemData.productId);
          setNewItemData({ accountId: '', productId: '', producerId: '', supplierId: '' });
          return;
        }
      }

      const sameDayItems = schedule.filter(s => s.date === todayStr);
      const maxIndex = sameDayItems.reduce((max, s) => Math.max(max, s.dailyIndex || 0), 0);
      const nextIndex = maxIndex + 1;

      await addDoc(collection(db, 'schedule'), {
        date: todayStr,
        accountId: null,
        productId: newItemData.productId,
        producerId: newItemData.producerId || null,
        supplierId: newItemData.supplierId || null,
        status: ScheduleStatus.PLANNED,
        userId: user.uid,
        scope: viewMode || 'PERSONAL',
        dailyIndex: nextIndex,
        productionCode: buildProductionCode({ date: todayStr, accountId: '', productId: newItemData.productId, dailyIndex: nextIndex }, accounts, products, schedule),
        createdAt: serverTimestamp()
      });
      setShowAddLineItem(false);
      setNewItemData({ accountId: '', productId: '', producerId: '', supplierId: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'schedule');
    }
  };

  const handleDeleteAsset = async (item: ScheduleItem, type: 'audio' | 'video' | 'finished', fileUrl: string) => {
    if (!confirm('Deseja realmente remover este arquivo da base de dados?')) return;
    try {
      const field = type === 'audio' ? 'audioMaterial' : type === 'video' ? 'videoMaterial' : 'finishedVideoUrl';
      const currentValue = (item as any)[field] || [];
      const updatedValue = Array.isArray(currentValue)
        ? currentValue.filter((f: any) => (typeof f === 'string' ? f : f.url) !== fileUrl)
        : [];
      
      const updates: any = {
        [field]: updatedValue
      };

      if (type === 'audio' || type === 'video') {
        const otherField = type === 'audio' ? 'videoMaterial' : 'audioMaterial';
        const otherValue = (item as any)[otherField] || [];
        const otherLength = Array.isArray(otherValue) ? otherValue.length : (otherValue ? 1 : 0);

        if (updatedValue.length === 0 || otherLength === 0) {
          updates.status = ScheduleStatus.PLANNED;
        }
      } else if (type === 'finished' && updatedValue.length === 0 && item.status === ScheduleStatus.PRODUCED) {
        updates.status = ScheduleStatus.EDITING;
        updates.producedAt = null;
      }

      await updateDoc(doc(db, 'schedule', item.id), updates);
    } catch (err: any) {
      alert('Erro ao deletar arquivo: ' + err.message);
    }
  };

  const allLibraryAssets = useMemo(() => {
    const list: Array<{
      item: ScheduleItem;
      type: 'audio' | 'video' | 'finished';
      url: string;
      name: string;
      productName: string;
      date: string;
    }> = [];

    schedule.forEach(item => {
      const prod = products.find(p => p.id === item.productId);
      const productName = prod?.name || 'Sem Produto';

      // Audios
      const audios = Array.isArray(item.audioMaterial) ? item.audioMaterial : (item.audioMaterial ? [item.audioMaterial] : []);
      audios.forEach((file: any) => {
        list.push({
          item,
          type: 'audio',
          url: typeof file === 'string' ? file : file.url,
          name: typeof file === 'string' ? 'Áudio Base' : file.name,
          productName,
          date: item.date
        });
      });

      // Raw Videos
      const videos = Array.isArray(item.videoMaterial) ? item.videoMaterial : (item.videoMaterial ? [item.videoMaterial] : []);
      videos.forEach((file: any) => {
        list.push({
          item,
          type: 'video',
          url: typeof file === 'string' ? file : file.url,
          name: typeof file === 'string' ? 'Material Bruto' : file.name,
          productName,
          date: item.date
        });
      });

      // Finished Videos
      const finished = Array.isArray(item.finishedVideoUrl) ? item.finishedVideoUrl : (item.finishedVideoUrl ? [item.finishedVideoUrl] : []);
      finished.forEach((file: any) => {
        list.push({
          item,
          type: 'finished',
          url: typeof file === 'string' ? file : file.url,
          name: typeof file === 'string' ? 'Vídeo Final' : file.name,
          productName,
          date: item.date
        });
      });
    });

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [schedule, products]);

  const filteredLibraryAssets = useMemo(() => {
    return allLibraryAssets.filter(asset => {
      const matchesType = libraryTypeFilter === 'all' || asset.type === libraryTypeFilter;
      const matchesSearch = asset.name.toLowerCase().includes(librarySearchQuery.toLowerCase()) || 
                            asset.productName.toLowerCase().includes(librarySearchQuery.toLowerCase()) ||
                            asset.date.includes(librarySearchQuery);
      return matchesType && matchesSearch;
    });
  }, [allLibraryAssets, libraryTypeFilter, librarySearchQuery]);

  const groupedByDate = useMemo<Record<string, ScheduleItem[]>>(() => {
    const filtered = schedule.filter(item => {
      const isSupplier = activeRole === 'supplier';
      const condProducer = isSupplier 
        ? (activeProducerId === 'unassigned' ? !item.supplierId : item.supplierId === activeProducerId)
        : (activeProducerId === 'unassigned' ? !item.producerId : item.producerId === activeProducerId);
      const condProduct = item.productId === activeProductId;
      const hasAudio = Array.isArray(item.audioMaterial) ? item.audioMaterial.length > 0 : !!item.audioMaterial;
      const hasVideo = Array.isArray(item.videoMaterial) ? item.videoMaterial.length > 0 : !!item.videoMaterial;
      const hasFinished = Array.isArray(item.finishedVideoUrl) ? item.finishedVideoUrl.length > 0 : !!item.finishedVideoUrl;
      return condProducer && condProduct && (hasAudio || hasVideo || hasFinished);
    });
    
    const groups: Record<string, ScheduleItem[]> = {};
    filtered.forEach(item => {
      if (!groups[item.date]) groups[item.date] = [];
      groups[item.date].push(item);
    });
    
    return Object.fromEntries(
      Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
    );
  }, [schedule, activeProducerId, activeProductId]);

  const getVisibleProductionItems = () => {
    const allProductItems = pendingProduction
      .filter(item => {
        const condProducer = activeProducerId === 'unassigned' ? !item.producerId : item.producerId === activeProducerId;
        const condProduct = item.productId === activeProductId;
        const condMaterial = userRole === 'editor' ? hasEditableMaterial(item) : true;
        return condProducer && condProduct && condMaterial;
      })
      .sort((a, b) => {
        const dateComp = a.date.localeCompare(b.date);
        if (dateComp !== 0) return dateComp;
        return (a.dailyIndex || 0) - (b.dailyIndex || 0);
      });

    const firstUncompletedIdx = allProductItems.findIndex(item => !isSupplierDone(item));
    if (userRole === 'editor') return allProductItems;
    if (firstUncompletedIdx !== -1) return allProductItems.slice(0, firstUncompletedIdx + 1);

    const virtualItem: ScheduleItem = {
      id: 'virtual-draft-item',
      userId: user?.uid || '',
      accountId: '',
      productId: activeProductId || '',
      producerId: activeProducerId === 'unassigned' ? '' : (activeProducerId || ''),
      supplierId: linkedProducer?.id || '',
      status: ScheduleStatus.PLANNED,
      audioMaterial: [],
      videoMaterial: [],
      finishedVideoUrl: [],
      date: todayStr,
    };
    return [...allProductItems, virtualItem];
  };

  const handleLinkEditorToProductionItem = async (item: ScheduleItem, editorId: string) => {
    const currentEditorId = getProductionItemEditorId(item);
    if (!editorId || editorId === currentEditorId) return;

    const selectedProd = producers.find(p => p.id === editorId);
    if (!selectedProd) return;

    setProductionEditorSelections(prev => ({ ...prev, [item.id]: editorId }));

    if (item.id !== 'virtual-draft-item') {
      await handleAssignRole(item.id, editorId, 'editor');
    }

    const currentLinked = Array.isArray(selectedProd.linkedProductIds) ? [...selectedProd.linkedProductIds] : [];
    if (!currentLinked.includes(item.productId)) {
      currentLinked.push(item.productId);
      await updateDoc(doc(db, 'producers', selectedProd.id), {
        linkedProductIds: currentLinked
      });
    }

    if (item.id === 'virtual-draft-item' || activeProducerId === 'unassigned') {
      setActiveProducerId(editorId);
    }
  };

  const getProductionItemEditorId = (item: ScheduleItem) => {
    return productionEditorSelections[item.id] || item.producerId || '';
  };

  const renderEditorLinkSelect = (item: ScheduleItem, className = '') => {
    const selectedEditorId = getProductionItemEditorId(item);

    if (userRole !== 'supplier' && selectedEditorId) {
      const linkedEditor = producers.find(p => p.id === selectedEditorId);
      return (
        <p className={`text-[10px] text-gray-500 font-black uppercase tracking-wider ${className}`}>
          Editor vinculado: <span className="text-gray-300">{linkedEditor?.name || 'Editor Geral'}</span>
        </p>
      );
    }

    return (
      <select
        className={`bg-[#0a0a0a] border border-[#222] rounded-xl px-3 py-2 text-[10px] font-black uppercase text-gray-400 cursor-pointer focus:border-orange-500 outline-none w-full ${className}`}
        onChange={(e) => handleLinkEditorToProductionItem(item, e.target.value)}
        value={selectedEditorId}
      >
        <option value="">Selecione...</option>
        {producers
          .filter(p => isProducerAvailableForRole(p, 'editor'))
          .map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </select>
    );
  };

  const renderSupplierUploadBox = (
    item: ScheduleItem,
    type: 'audio' | 'video',
    files: any[],
    canUploadSupplierMaterial: boolean,
    supplierUploadBlockTitle: string
  ) => {
    const isAudio = type === 'audio';
    const Icon = isAudio ? Music : Video;
    const colorClass = isAudio ? 'text-blue-400' : 'text-purple-400';
    const hoverClass = isAudio ? 'hover:border-blue-500/50 hover:bg-blue-500/5' : 'hover:border-purple-500/50 hover:bg-purple-500/5';
    const label = isAudio ? 'Base de Audio' : 'Materiais Brutos';
    const uploadLabel = isAudio ? 'Carregar Audio' : 'Carregar Brutos';

    return (
      <div className="bg-[#111] p-4 rounded-2xl border border-[#222]/80 space-y-3 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <span className={`text-[11px] font-black uppercase tracking-wider ${colorClass} flex items-center gap-1.5 min-w-0`}>
            <Icon className="w-3.5 h-3.5 shrink-0" /> <span className="break-words">{label}</span>
          </span>
          <span className="text-[10px] font-bold text-gray-500 shrink-0">
            {files.length} {files.length === 1 ? 'arquivo' : 'arquivos'}
          </span>
        </div>

        <button
          onClick={() => {
            setActiveUploadContext({ id: item.id, type });
            (isAudio ? audioInputRef : videoInputRef).current?.click();
          }}
          disabled={!canUploadSupplierMaterial || (uploadingItem?.id === item.id && uploadingItem?.type === type)}
          title={!canUploadSupplierMaterial ? supplierUploadBlockTitle : uploadLabel}
          className={`w-full min-h-12 py-3.5 px-4 rounded-xl border border-dashed border-[#333] bg-[#0a0a0a] text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-white flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${hoverClass}`}
        >
          {uploadingItem?.id === item.id && uploadingItem?.type === type ? (
            <>
              <div className={`w-3.5 h-3.5 border-2 ${isAudio ? 'border-blue-500' : 'border-purple-500'} border-t-transparent rounded-full animate-spin`} />
              <span>Carregando...</span>
            </>
          ) : (
            <>
              <CloudUpload className={`w-4 h-4 ${isAudio ? 'text-blue-500' : 'text-purple-500'}`} />
              <span>{uploadLabel}</span>
            </>
          )}
        </button>

        {files.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-1 max-h-36 overflow-y-auto">
            {files.map((file: any, idx: number) => {
              const url = typeof file === 'string' ? file : file.url;
              const name = typeof file === 'string' ? `${isAudio ? 'Audio' : 'Bruto'} #${idx + 1}` : (file.name || `${isAudio ? 'Audio' : 'Bruto'} #${idx + 1}`);
              return (
                <div key={idx} className={`flex items-center justify-between gap-2 bg-[#0d0d0d] border border-[#1a1a1a] px-3 py-2 rounded-xl text-xs ${isAudio ? 'text-blue-400/90 hover:text-blue-400 hover:border-blue-500/20' : 'text-purple-400/90 hover:text-purple-400 hover:border-purple-500/20'} transition-all min-w-0`}>
                  <a href={url} target="_blank" rel="noreferrer" className="truncate font-semibold hover:underline flex-1 min-w-0" title={name}>
                    {name}
                  </a>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setActivePreviewVideo({ url, name, type })}
                      className={`p-1 ${isAudio ? 'hover:bg-blue-500/10' : 'hover:bg-purple-500/10'} rounded transition-colors cursor-pointer`}
                      title="Reproduzir"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                    <a href={url} target="_blank" rel="noreferrer" className={`p-1 ${isAudio ? 'hover:bg-blue-500/10' : 'hover:bg-purple-500/10'} rounded transition-colors`} title="Baixar">
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => handleDeleteAsset(item, type, url)}
                      className="p-1 hover:bg-red-500/10 rounded text-red-500 transition-colors cursor-pointer"
                      title="Apagar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header with Navigation */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            {(activeProducerId || setActiveTab) && (
              <button 
                onClick={() => {
                  if (activeProducerId) {
                    if (activeProductId) setActiveProductId(null);
                    else {
                      setActiveProducerId(null);
                      setActiveRole(null);
                    }
                  } else {
                    if (setActiveTab) {
                      setActiveTab('dashboard');
                    }
                  }
                }}
                className="p-2 bg-[#141414] border border-[#222] rounded-xl text-gray-500 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <h3 className="text-3xl font-black text-white tracking-tight">
              {subView === 'line' && !activeProducerId && 'Esteira de Produção'}
              {subView === 'line' && activeProducerId && !activeProductId && (activeProducerId === 'unassigned' ? 'Pastas sem Editor' : `Pastas: ${currentProducer?.name}`)}
              {subView === 'line' && activeProducerId && activeProductId && `Produção: ${currentProduct?.name}`}
              {subView === 'editors' && !activeProducerId && 'Gerenciar Editores'}
              {subView === 'suppliers' && !activeProducerId && 'Gerenciar Fornecedores'}
              {subView === 'library' && 'Biblioteca de Conteúdo'}
              {(subView === 'editors' || subView === 'suppliers') && activeProducerId && !activeProductId && (activeProducerId === 'unassigned' ? 'Sem Atribuição' : `${activeRole === 'supplier' ? 'Fornecedor' : 'Editor'}: ${currentProducer?.name}`)}
              {(subView === 'editors' || subView === 'suppliers') && activeProductId && `Produção: ${currentProduct?.name}`}
            </h3>
          </div>
          <p className="text-sm text-gray-500 font-medium">
            {subView === 'line' && !activeProducerId && 'Visualize a produção organizada pelas pastas dos editores.'}
            {subView === 'line' && activeProducerId && !activeProductId && `Clique na pasta do produto para ver os conteúdos de ${activeProducerId === 'unassigned' ? 'nenhum editor' : currentProducer?.name}.`}
            {subView === 'line' && activeProducerId && activeProductId && `Conteúdos planejados para ${currentProduct?.name}.`}
            {subView === 'editors' && !activeProducerId && 'Cadastre e gerencie sua equipe de editores.'}
            {subView === 'suppliers' && !activeProducerId && 'Cadastre e gerencie sua equipe de fornecedores.'}
            {subView === 'library' && 'Gerencie e apague arquivos de áudios, vídeos brutos ou prontos do banco de dados.'}
          </p>
        </div>
        
        {subView === 'editors' && !activeProducerId && (
          <button 
            onClick={() => setShowAddProducer(true)}
            className="px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-orange-500 text-black hover:bg-orange-400 transition-all flex items-center gap-2 shadow-lg shadow-orange-500/20"
          >
            <UserPlus className="w-4 h-4" />
            Novo Editor
          </button>
        )}

        {subView === 'suppliers' && !activeProducerId && (
          <button 
            onClick={() => setShowAddProducer(true)}
            className="px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-blue-500 text-white hover:bg-blue-400 transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20"
          >
            <UserPlus className="w-4 h-4" />
            Novo Fornecedor
          </button>
        )}

        {(subView === 'line' || (subView === 'editors' && activeProducerId === 'unassigned')) && !activeProductId && (
          <button 
            onClick={() => {
              const baseData = { accountId: '', productId: '', producerId: '' };
              if (activeProducerId && activeProducerId !== 'unassigned') {
                baseData.producerId = activeProducerId;
              }
              setNewItemData(baseData);
              setShowAddLineItem(true);
            }}
            className="px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-white text-black hover:bg-orange-500 transition-all flex items-center gap-2 shadow-lg shadow-white/5"
          >
            <Plus className="w-4 h-4" />
            {activeProducerId && activeProducerId !== 'unassigned' ? 'Vincular Produto' : 'Adicionar Item'}
          </button>
        )}

      </div>

      <AnimatePresence mode="wait">
        {/* VIEW 1: Line (Folders or filtered list) */}
        {subView === 'line' && (
          <motion.div 
            key="line-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-8"
          >
            {!activeProducerId ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {/* Editor Folders */}
                {producers.filter(p => {
                  if (p.hidden) return false;
                  if (isPartner || userRole === 'supplier') return isProducerAvailableForRole(p, 'editor');
                  if (userRole === 'editor') return isProducerLinkedToUser(p, user);
                  return false;
                }).map(p => (
                  <button
                    key={p.id}
                    onClick={() => setActiveProducerId(p.id)}
                    className="w-full flex flex-col items-center gap-4 p-8 bg-[#141414] border border-[#222] rounded-[2.5rem] hover:border-orange-500/50 transition-all text-center group relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <Folder className="w-20 h-20 text-orange-500/20 group-hover:text-orange-500/40 relative z-10 transition-all" fill="currentColor" />
                    <div className="space-y-1 relative z-10">
                      <p className="text-white font-black text-sm uppercase tracking-widest">{p.name}</p>
                      <div className="bg-[#0a0a0a] px-3 py-1 rounded-full border border-[#222] text-[9px] font-black text-gray-500 uppercase">
                        {userRole === 'supplier' ? 'Upload de Materiais' : `${pendingProduction.filter(s => s.producerId === p.id && (userRole === 'editor' ? hasEditableMaterial(s) : true)).length} tarefas`}
                      </div>
                    </div>
                  </button>
                ))}

                {userRole !== 'editor' && (
                  <button
                    onClick={() => setActiveProducerId('unassigned')}
                    className="w-full flex flex-col items-center gap-4 p-8 bg-[#141414]/50 border border-[#222] border-dashed rounded-[2.5rem] hover:border-orange-500/50 transition-all text-center group"
                  >
                    <Folder className="w-20 h-20 text-gray-800 group-hover:text-gray-700 transition-all" fill="currentColor" />
                    <div className="space-y-1">
                      <p className="text-gray-500 font-black text-sm uppercase tracking-widest">Sem Editor</p>
                      <div className="bg-[#0a0a0a] px-3 py-1 rounded-full border border-[#222] text-[9px] font-black text-gray-700 uppercase">
                        {userRole === 'supplier' ? 'Upload de Materiais' : `${pendingProduction.filter(s => !s.producerId).length} tarefas`}
                      </div>
                    </div>
                  </button>
                )}
              </div>
            ) : !activeProductId ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                 {activeProducerId === 'unassigned' ? (
                   pendingProduction.filter(s => !s.producerId).map(item => {
                     const prod = products.find(p => p.id === item.productId);
                     return (
                       <button
                         key={item.id}
                         onClick={() => setActiveProductId(item.productId)}
                         className="group relative flex flex-col items-center gap-4 p-8 bg-[#141414] border border-[#222] rounded-[2.5rem] hover:border-orange-500/50 transition-all text-center"
                       >
                         <Folder className="w-20 h-20 text-blue-500/10 group-hover:text-blue-500/30" fill="currentColor" />
                         <p className="text-white font-black text-sm uppercase tracking-widest leading-tight">{prod?.name}</p>
                         <div className="bg-[#0a0a0a] px-3 py-1 rounded-full border border-[#222] text-[9px] font-black text-gray-500 uppercase">
                           {userRole === 'supplier' ? 'Upload de Materiais' : 'Aguardando Editor'}
                         </div>
                       </button>
                     );
                   })
                 ) : (
                    getProductGroupsForProducer(activeProducerId).map(group => (
                      <button
                        key={group.product.id}
                        onClick={() => setActiveProductId(group.product.id)}
                        className="group relative flex flex-col items-center gap-4 p-8 bg-[#141414] border border-[#222] rounded-[2.5rem] hover:border-orange-500/50 transition-all text-center"
                      >
                        <Folder className="w-20 h-20 text-blue-500/10 group-hover:text-blue-500/30" fill="currentColor" />
                        <p className="text-white font-black text-sm uppercase tracking-widest leading-tight">{group.product.name}</p>
                        <div className="bg-[#0a0a0a] px-3 py-1 rounded-full border border-[#222] text-[9px] font-black text-gray-500 uppercase">
                          {userRole === 'supplier' ? 'Upload de Materiais' : `${userRole === 'editor' ? group.items.filter(hasEditableMaterial).length : group.items.length} tarefas`}
                        </div>
                      </button>
                    ))
                 )}
                 {activeProducerId !== 'unassigned' && getProductGroupsForProducer(activeProducerId).length === 0 && (
                   <div className="col-span-full py-20 text-center">
                     <p className="text-gray-600 uppercase font-black text-xs tracking-widest">Nenhuma pasta de produto vinculada.</p>
                   </div>
                 )}
              </div>
            ) : (
              <>
                {userRole === 'supplier' && (
                  <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
                    <div className="bg-[#141414] border border-[#222] rounded-[2rem] p-6">
                      <p className="text-[10px] font-black uppercase tracking-widest text-orange-500 mb-2">Vinculo de Referencia</p>
                      <h4 className="text-white font-black text-lg italic">Registre o video TikTok antes de subir os materiais</h4>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                        O ultimo link livre deste fornecedor sera vinculado automaticamente ao audio ou video bruto enviado para a esteira.
                      </p>
                      {currentProduct?.referenceUrl ? (
                        <a
                          href={currentProduct.referenceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-5 inline-flex w-full sm:w-auto items-center justify-center gap-2 bg-orange-500 text-black hover:bg-orange-400 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Ir para o produto
                        </a>
                      ) : (
                        <button
                          type="button"
                          disabled
                          title="Este produto ainda nao possui link referencia cadastrado."
                          className="mt-5 inline-flex w-full sm:w-auto items-center justify-center gap-2 bg-[#0a0a0a] border border-[#222] text-gray-600 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest cursor-not-allowed"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Ir para o produto
                        </button>
                      )}
                    </div>
                    <TiktokVideoIdentifier
                      tiktokLinks={tiktokLinks}
                      user={user}
                      viewMode={viewMode}
                      linkedProducer={linkedProducer}
                      pendingLinkId={activePendingReferenceLink?.id || null}
                      onPendingLinkAccepted={(link) => {
                        setPendingReferenceLink(link);
                        if (pendingReferenceStorageKey) localStorage.setItem(pendingReferenceStorageKey, link.id);
                      }}
                    />
                  </div>
                )}
                <div className="md:hidden space-y-4">
                  {(() => {
                    const displayedItems = getVisibleProductionItems();

                    if (displayedItems.length === 0) {
                      return (
                        <div className="bg-[#141414] border border-[#222] rounded-3xl px-5 py-10 text-center">
                          <p className="text-sm font-black text-white uppercase tracking-widest">Nenhum material pendente</p>
                          <p className="text-xs text-gray-500 leading-relaxed mt-2">
                            Este produto continua vinculado a voce. Quando novos materiais chegarem, eles aparecerao aqui; o historico permanece disponivel no Cofre de Conteudos abaixo.
                          </p>
                        </div>
                      );
                    }

                    return displayedItems.map(item => {
                      const acc = accounts.find(a => a.id === item.accountId);
                      const audios = Array.isArray(item.audioMaterial) ? item.audioMaterial : (item.audioMaterial ? [item.audioMaterial] : []);
                      const videos = Array.isArray(item.videoMaterial) ? item.videoMaterial : (item.videoMaterial ? [item.videoMaterial] : []);
                      const finishedVideos = Array.isArray(item.finishedVideoUrl) ? item.finishedVideoUrl : (item.finishedVideoUrl ? [item.finishedVideoUrl] : []);
                      const hasFinished = finishedVideos.length > 0;
                      const supplierUploadBlockMessages = userRole === 'supplier'
                        ? getSupplierUploadBlockMessages(
                            !!item.creatorLinkId || !!activePendingReferenceLink,
                            !!getProductionItemEditorId(item)
                          )
                        : [];
                      const canUploadSupplierMaterial = userRole !== 'supplier' || supplierUploadBlockMessages.length === 0;
                      const supplierUploadBlockTitle = supplierUploadBlockMessages.join(' | ');

                      return (
                        <div key={item.id} className="bg-[#141414] border border-[#222] rounded-3xl p-4 min-[360px]:p-5 space-y-5 overflow-hidden">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-11 h-11 bg-[#0a0a0a] rounded-xl flex items-center justify-center border border-[#222] overflow-hidden shrink-0">
                              {acc?.imageUrl ? <img src={acc.imageUrl} className="w-full h-full object-cover" alt="" /> : <Monitor className="w-4 h-4 text-gray-600" />}
                            </div>
                            <div className="min-w-0 flex-1 space-y-2">
                              <p className="text-sm font-black text-white leading-tight break-words">
                                {(item.dailyIndex && hasAnyMaterial(item)) ? `${String(item.dailyIndex).padStart(3, '0')} - ` : ''}{currentProduct?.name}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {userRole === 'supplier' && isSupplierDone(item) && (
                                  <span className="inline-flex items-center gap-1 bg-green-500/15 text-green-400 border border-green-500/20 px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider">
                                    <Check className="w-2.5 h-2.5" /> Concluido
                                  </span>
                                )}
                                {userRole === 'supplier' && !isSupplierDone(item) && (
                                  <span className="inline-flex items-center gap-1 bg-orange-500/15 text-orange-400 border border-orange-500/20 px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider">
                                    Pendente
                                  </span>
                                )}
                                {userRole !== 'supplier' && (
                                  <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-full border ${
                                    item.status === ScheduleStatus.PRODUCED
                                      ? 'bg-green-500/10 text-green-500 border-green-500/20'
                                      : 'bg-orange-500/10 text-orange-500 border-orange-500/20'
                                  }`}>
                                    {item.status}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-3">
                            <div className="bg-[#0d0d0d] border border-[#222] rounded-2xl p-3 min-w-0">
                              <p className="text-[9px] font-black uppercase tracking-widest text-gray-600 mb-1">Conta</p>
                              <p className="text-xs text-gray-300 font-bold uppercase break-words">{acc?.name || 'Sem Conta'}</p>
                            </div>
                            <div className="bg-[#0d0d0d] border border-[#222] rounded-2xl p-3 min-w-0">
                              <p className="text-[9px] font-black uppercase tracking-widest text-gray-600 mb-2">Editor Vinculado</p>
                              {renderEditorLinkSelect(item)}
                            </div>
                          </div>

                          {userRole === 'supplier' ? (
                            <div className="space-y-3 min-w-0">
                              {renderSupplierUploadBox(item, 'audio', audios, canUploadSupplierMaterial, supplierUploadBlockTitle)}
                              {renderSupplierUploadBox(item, 'video', videos, canUploadSupplierMaterial, supplierUploadBlockTitle)}
                              {!canUploadSupplierMaterial && (
                                <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 rounded-2xl p-3 text-[11px] font-bold leading-relaxed space-y-1">
                                  {supplierUploadBlockMessages.map(message => (
                                    <div key={message}>{message}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              <div className="space-y-3 min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Materiais brutos</p>
                                {audios.length === 0 && videos.length === 0 ? (
                                  <p className="text-xs text-gray-600 italic">Nenhum material</p>
                                ) : (
                                  <div className="space-y-2">
                                    {audios.map((file: any, idx: number) => {
                                      const url = typeof file === 'string' ? file : file.url;
                                      const name = typeof file === 'string' ? `Audio #${idx + 1}` : (file.name || `Audio #${idx + 1}`);
                                      return (
                                        <a key={`mobile-audio-${idx}`} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 px-3 py-3 rounded-2xl text-xs font-bold transition-all w-full min-w-0" title={name}>
                                          <Music className="w-4 h-4 shrink-0" />
                                          <span className="truncate flex-1 text-left min-w-0">{name}</span>
                                          <Download className="w-4 h-4 shrink-0 text-gray-400" />
                                        </a>
                                      );
                                    })}
                                    {videos.map((file: any, idx: number) => {
                                      const url = typeof file === 'string' ? file : file.url;
                                      const name = typeof file === 'string' ? `Bruto #${idx + 1}` : (file.name || `Bruto #${idx + 1}`);
                                      return (
                                        <a key={`mobile-video-${idx}`} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 px-3 py-3 rounded-2xl text-xs font-bold transition-all w-full min-w-0" title={name}>
                                          <Video className="w-4 h-4 shrink-0" />
                                          <span className="truncate flex-1 text-left min-w-0">{name}</span>
                                          <Download className="w-4 h-4 shrink-0 text-gray-400" />
                                        </a>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              <div className="space-y-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Video final</p>
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    onClick={() => {
                                      setActiveUploadContext({ id: item.id, type: 'finished' });
                                      finishedInputRef.current?.click();
                                    }}
                                    disabled={uploadingItem?.id === item.id}
                                    className={`flex-1 min-w-[170px] min-h-12 justify-center px-4 py-3 rounded-2xl border flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                                      hasFinished
                                        ? 'bg-green-500/10 border-green-500/30 text-green-500 hover:bg-green-500/20'
                                        : 'bg-orange-500/10 border-orange-500/30 text-orange-500 hover:bg-orange-500/20'
                                    } ${uploadingItem?.id === item.id ? 'opacity-50 cursor-wait' : ''}`}
                                  >
                                    {uploadingItem?.id === item.id && uploadingItem?.type === 'finished' ? (
                                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <CloudUpload className="w-3 h-3" />
                                    )}
                                    {uploadingItem?.id === item.id && uploadingItem?.type === 'finished' ? 'Carregando...' : (hasFinished ? 'Atualizar' : 'Enviar Video')}
                                  </button>

                                  {hasFinished && !uploadingItem && (
                                    <>
                                      <button
                                        onClick={() => {
                                          const file = finishedVideos[0] as any;
                                          const url = typeof file === 'string' ? file : file.url;
                                          const name = typeof file === 'string' ? 'Video pronto' : (file.name || 'Video pronto');
                                          setActivePreviewVideo({ url, name, type: 'video' });
                                        }}
                                        className="p-3 bg-[#0a0a0a] border border-[#222] rounded-2xl text-green-500 hover:text-green-400"
                                        title="Reproduzir video pronto"
                                      >
                                        <Play className="w-4 h-4" />
                                      </button>
                                      {userRole === 'editor' && (
                                        <button
                                          onClick={() => {
                                            const file = finishedVideos[0] as any;
                                            const url = typeof file === 'string' ? file : file.url;
                                            handleDeleteAsset(item, 'finished', url);
                                          }}
                                          className="p-3 bg-[#0a0a0a] border border-[#222] rounded-2xl text-red-500 hover:text-red-400"
                                          title="Excluir video pronto"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>

                <div className="hidden md:block bg-[#141414] border border-[#222] rounded-[2.5rem] overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#222] bg-[#1a1a1a]/50">
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-500 tracking-widest">Item</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-500 tracking-widest text-center">Materiais Brutos</th>
                      {userRole !== 'supplier' && (
                        <>
                          <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-500 tracking-widest text-center">Vídeo Final</th>
                          {userRole !== 'editor' && (
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-500 tracking-widest text-right">Status</th>
                          )}
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#222]">
                    {(() => {
                      const displayedItems = getVisibleProductionItems();

                      if (displayedItems.length === 0) {
                        return (
                          <tr>
                            <td colSpan={userRole === 'supplier' ? 2 : 3} className="px-6 py-12 text-center">
                              <div className="max-w-md mx-auto space-y-2">
                                <p className="text-sm font-black text-white uppercase tracking-widest">Nenhum material pendente</p>
                                <p className="text-xs text-gray-500 leading-relaxed">
                                  Este produto continua vinculado a voce. Quando novos materiais chegarem, eles aparecerao aqui; o historico permanece disponivel no Cofre de Conteudos abaixo.
                                </p>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return displayedItems.map(item => {
                        const acc = accounts.find(a => a.id === item.accountId);
                        const audios = Array.isArray(item.audioMaterial) ? item.audioMaterial : (item.audioMaterial ? [item.audioMaterial] : []);
                        const videos = Array.isArray(item.videoMaterial) ? item.videoMaterial : (item.videoMaterial ? [item.videoMaterial] : []);
                        const finishedVideos = Array.isArray(item.finishedVideoUrl) ? item.finishedVideoUrl : (item.finishedVideoUrl ? [item.finishedVideoUrl] : []);
                        const supplierUploadBlockMessages = userRole === 'supplier'
                          ? getSupplierUploadBlockMessages(
                              !!item.creatorLinkId || !!activePendingReferenceLink,
                              !!getProductionItemEditorId(item)
                            )
                          : [];
                        const canUploadSupplierMaterial = userRole !== 'supplier' || supplierUploadBlockMessages.length === 0;
                        const supplierUploadBlockTitle = supplierUploadBlockMessages.join(' | ');

                        return (
                          <tr key={item.id} className="hover:bg-[#1a1a1a]/50 transition-colors">
                            <td data-label="Item" className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                 <div className="w-10 h-10 bg-[#0a0a0a] rounded-xl flex items-center justify-center border border-[#222]">
                                   {acc?.imageUrl ? <img src={acc.imageUrl} className="w-full h-full object-cover rounded-xl" alt="" /> : <Monitor className="w-4 h-4 text-gray-600" />}
                                 </div>
                                 <div className="flex flex-col">
                                   <div className="flex items-center gap-2 flex-wrap">
                                     <p className="text-sm font-bold text-white leading-tight">
                                       {(item.dailyIndex && hasAnyMaterial(item)) ? `${String(item.dailyIndex).padStart(3, '0')} - ` : ''}{currentProduct?.name}
                                     </p>
                                     {userRole === 'supplier' && isSupplierDone(item) && (
                                       <span className="inline-flex items-center gap-1 bg-green-500/15 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">
                                         <Check className="w-2.5 h-2.5" /> Concluído
                                       </span>
                                     )}
                                     {userRole === 'supplier' && !isSupplierDone(item) && (
                                       <span className="inline-flex items-center gap-1 bg-orange-500/15 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider animate-pulse">
                                         Pendente
                                       </span>
                                     )}
                                   </div>
                                   <p className="text-[10px] text-gray-500 font-bold uppercase mt-0.5">{acc?.name || 'Sem Conta'}</p>
                                   {(userRole === 'supplier' || !item.producerId) && (
                                     <div className="mt-2 text-left">
                                       {renderEditorLinkSelect(item, 'max-w-[180px] py-1.5 px-2.5')}
                                     </div>
                                   )}
                                 </div>
                              </div>
                            </td>
                            <td data-label="Materiais Brutos" className="px-6 py-4">
                              {userRole === 'supplier' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
                                  {/* AUDIO COLUMN */}
                                  <div className="bg-[#111] p-4 rounded-2xl border border-[#222]/80 space-y-3 min-w-[200px]">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-black uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                                        <Music className="w-3.5 h-3.5" /> Áudio Base
                                      </span>
                                      <span className="text-[10px] font-bold text-gray-500">
                                        {audios.length} {audios.length === 1 ? 'arquivo' : 'arquivos'}
                                      </span>
                                    </div>
                                    
                                    {/* Upload Button */}
                                    <button
                                      onClick={() => {
                                        setActiveUploadContext({ id: item.id, type: 'audio' });
                                        audioInputRef.current?.click();
                                      }}
                                      disabled={!canUploadSupplierMaterial || (uploadingItem?.id === item.id && uploadingItem?.type === 'audio')}
                                      title={!canUploadSupplierMaterial ? supplierUploadBlockTitle : 'Carregar audio'}
                                      className="w-full py-3.5 px-4 rounded-xl border border-dashed border-[#333] hover:border-blue-500/50 bg-[#0a0a0a] hover:bg-blue-500/5 text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-white flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {uploadingItem?.id === item.id && uploadingItem?.type === 'audio' ? (
                                        <>
                                          <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                          <span>Carregando...</span>
                                        </>
                                      ) : (
                                        <>
                                          <CloudUpload className="w-4 h-4 text-blue-500" />
                                          <span>Carregar Áudio</span>
                                        </>
                                      )}
                                    </button>

                                    {/* List of uploaded audios */}
                                    {audios.length > 0 && (
                                      <div className="flex flex-col gap-1.5 mt-1 max-h-36 overflow-y-auto">
                                        {audios.map((file: any, idx: number) => {
                                          const url = typeof file === 'string' ? file : file.url;
                                          const name = typeof file === 'string' ? `Áudio #${idx + 1}` : (file.name || `Áudio #${idx + 1}`);
                                          return (
                                            <div key={idx} className="flex items-center justify-between gap-2 bg-[#0d0d0d] border border-[#1a1a1a] px-3 py-2 rounded-xl text-xs text-blue-400/90 hover:text-blue-400 hover:border-blue-500/20 transition-all">
                                              <a href={url} target="_blank" rel="noreferrer" className="truncate font-semibold hover:underline flex-1" title={name}>
                                                {name}
                                              </a>
                                              <div className="flex items-center gap-1 flex-shrink-0">
                                                <button
                                                  onClick={() => setActivePreviewVideo({ url, name, type: 'audio' })}
                                                  className="p-1 hover:bg-blue-500/10 rounded text-blue-400 transition-colors cursor-pointer"
                                                  title="Reproduzir"
                                                >
                                                  <Play className="w-3.5 h-3.5" />
                                                </button>
                                                <a href={url} target="_blank" rel="noreferrer" className="p-1 hover:bg-blue-500/10 rounded text-blue-400 transition-colors" title="Baixar">
                                                  <Download className="w-3.5 h-3.5" />
                                                </a>
                                                <button 
                                                  onClick={() => handleDeleteAsset(item, 'audio', url)}
                                                  className="p-1 hover:bg-red-500/10 rounded text-red-500 transition-colors cursor-pointer"
                                                  title="Apagar"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>

                                  {/* BRUTOS VIDEO COLUMN */}
                                  <div className="bg-[#111] p-4 rounded-2xl border border-[#222]/80 space-y-3 min-w-[200px]">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-black uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                                        <Video className="w-3.5 h-3.5" /> Materiais Brutos
                                      </span>
                                      <span className="text-[10px] font-bold text-gray-500">
                                        {videos.length} {videos.length === 1 ? 'arquivo' : 'arquivos'}
                                      </span>
                                    </div>

                                    {/* Upload Button */}
                                    <button
                                      onClick={() => {
                                        setActiveUploadContext({ id: item.id, type: 'video' });
                                        videoInputRef.current?.click();
                                      }}
                                      disabled={!canUploadSupplierMaterial || (uploadingItem?.id === item.id && uploadingItem?.type === 'video')}
                                      title={!canUploadSupplierMaterial ? supplierUploadBlockTitle : 'Carregar brutos'}
                                      className="w-full py-3.5 px-4 rounded-xl border border-dashed border-[#333] hover:border-purple-500/50 bg-[#0a0a0a] hover:bg-purple-500/5 text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-white flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {uploadingItem?.id === item.id && uploadingItem?.type === 'video' ? (
                                        <>
                                          <div className="w-3.5 h-3.5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                          <span>Carregando...</span>
                                        </>
                                      ) : (
                                        <>
                                          <CloudUpload className="w-4 h-4 text-purple-500" />
                                          <span>Carregar Brutos</span>
                                        </>
                                      )}
                                    </button>

                                    {/* List of uploaded video raw files */}
                                    {videos.length > 0 && (
                                      <div className="flex flex-col gap-1.5 mt-1 max-h-36 overflow-y-auto">
                                        {videos.map((file: any, idx: number) => {
                                          const url = typeof file === 'string' ? file : file.url;
                                          const name = typeof file === 'string' ? `Bruto #${idx + 1}` : (file.name || `Bruto #${idx + 1}`);
                                          return (
                                            <div key={idx} className="flex items-center justify-between gap-2 bg-[#0d0d0d] border border-[#1a1a1a] px-3 py-2 rounded-xl text-xs text-purple-400/90 hover:text-purple-400 hover:border-purple-500/20 transition-all">
                                              <a href={url} target="_blank" rel="noreferrer" className="truncate font-semibold hover:underline flex-1" title={name}>
                                                {name}
                                              </a>
                                              <div className="flex items-center gap-1 flex-shrink-0">
                                                <button
                                                  onClick={() => setActivePreviewVideo({ url, name, type: 'video' })}
                                                  className="p-1 hover:bg-purple-500/10 rounded text-purple-400 transition-colors cursor-pointer"
                                                  title="Reproduzir"
                                                >
                                                  <Play className="w-3.5 h-3.5" />
                                                </button>
                                                <a href={url} target="_blank" rel="noreferrer" className="p-1 hover:bg-purple-500/10 rounded text-purple-400 transition-colors" title="Baixar">
                                                  <Download className="w-3.5 h-3.5" />
                                                </a>
                                                <button 
                                                  onClick={() => handleDeleteAsset(item, 'video', url)}
                                                  className="p-1 hover:bg-red-500/10 rounded text-red-500 transition-colors cursor-pointer"
                                                  title="Apagar"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>

                                  {!canUploadSupplierMaterial && (
                                    <div className="md:col-span-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 rounded-2xl p-3 text-[11px] font-bold leading-relaxed">
                                      {supplierUploadBlockMessages.map(message => (
                                        <div key={message}>{message}</div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                userRole === 'editor' ? (
                                  <div className="flex flex-col gap-1.5 items-center justify-center max-w-xs mx-auto">
                                    {audios.length === 0 && videos.length === 0 ? (
                                      <span className="text-xs text-gray-600 italic">Nenhum material</span>
                                    ) : (
                                      <>
                                        {audios.map((file: any, idx: number) => {
                                          const url = typeof file === 'string' ? file : file.url;
                                          const name = typeof file === 'string' ? `Áudio #${idx + 1}` : (file.name || `Áudio #${idx + 1}`);
                                          return (
                                            <a 
                                              key={`audio-${idx}`}
                                              href={url} 
                                              target="_blank" 
                                              rel="noreferrer" 
                                              className="flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 px-2.5 py-1.5 rounded-xl text-xs font-semibold max-w-[200px] truncate transition-all w-full"
                                              title={name}
                                            >
                                              <Music className="w-3.5 h-3.5 flex-shrink-0" />
                                              <span className="truncate flex-1 text-left">{name}</span>
                                              <Download className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 hover:text-white" />
                                            </a>
                                          );
                                        })}
                                        {videos.map((file: any, idx: number) => {
                                          const url = typeof file === 'string' ? file : file.url;
                                          const name = typeof file === 'string' ? `Bruto #${idx + 1}` : (file.name || `Bruto #${idx + 1}`);
                                          return (
                                            <a 
                                              key={`video-${idx}`}
                                              href={url} 
                                              target="_blank" 
                                              rel="noreferrer" 
                                              className="flex items-center gap-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 px-2.5 py-1.5 rounded-xl text-xs font-semibold max-w-[200px] truncate transition-all w-full"
                                              title={name}
                                            >
                                              <Video className="w-3.5 h-3.5 flex-shrink-0" />
                                              <span className="truncate flex-1 text-left">{name}</span>
                                              <Download className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 hover:text-white" />
                                            </a>
                                          );
                                        })}
                                      </>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center gap-3">
                                    {/* Audio Material */}
                                    <div className="flex flex-col items-center gap-1">
                                      <button 
                                        onClick={() => {
                                          setActiveUploadContext({ id: item.id, type: 'audio' });
                                          audioInputRef.current?.click();
                                        }}
                                        disabled={uploadingItem?.id === item.id && uploadingItem?.type === 'audio'}
                                        className={`p-2 rounded-lg border flex items-center gap-2 transition-all ${
                                          (Array.isArray(item.audioMaterial) ? item.audioMaterial.length > 0 : !!item.audioMaterial) 
                                            ? 'bg-blue-500/10 border-blue-500/30 text-blue-500 hover:bg-blue-500/20' 
                                            : 'bg-[#0a0a0a] border-[#222] text-gray-600 hover:border-gray-500'
                                        } ${uploadingItem?.id === item.id && uploadingItem?.type === 'audio' ? 'opacity-50 cursor-wait' : ''}`}
                                        title="Carregar Áudio"
                                      >
                                        {uploadingItem?.id === item.id && uploadingItem?.type === 'audio' ? (
                                          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                          <Music className="w-4 h-4" />
                                        )}
                                      </button>
                                      <span className="text-[8px] font-black uppercase text-gray-600">Áudio</span>
                                    </div>

                                    {/* Video Material */}
                                    <div className="flex flex-col items-center gap-1">
                                      <button 
                                        onClick={() => {
                                          setActiveUploadContext({ id: item.id, type: 'video' });
                                          videoInputRef.current?.click();
                                        }}
                                        disabled={uploadingItem?.id === item.id && uploadingItem?.type === 'video'}
                                        className={`p-2 rounded-lg border flex items-center gap-2 transition-all ${
                                          (Array.isArray(item.videoMaterial) ? item.videoMaterial.length > 0 : !!item.videoMaterial) 
                                            ? 'bg-purple-500/10 border-purple-500/30 text-purple-500 hover:bg-purple-500/20' 
                                            : 'bg-[#0a0a0a] border-[#222] text-gray-600 hover:border-gray-500'
                                        } ${uploadingItem?.id === item.id && uploadingItem?.type === 'video' ? 'opacity-50 cursor-wait' : ''}`}
                                        title="Carregar Brutos"
                                      >
                                        {uploadingItem?.id === item.id && uploadingItem?.type === 'video' ? (
                                          <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                          <Video className="w-4 h-4" />
                                        )}
                                      </button>
                                      <span className="text-[8px] font-black uppercase text-gray-600">Brutos</span>
                                    </div>
                                 </div>
                                )
                               )}
                            </td>
                            {userRole !== 'supplier' && (
                              <>
                                <td data-label="Video Final" className="px-6 py-4">
                                   <div className="flex items-center justify-center gap-2">
                                     <button 
                                       onClick={() => {
                                         setActiveUploadContext({ id: item.id, type: 'finished' });
                                         finishedInputRef.current?.click();
                                       }}
                                       disabled={uploadingItem?.id === item.id}
                                       className={`px-4 py-2 rounded-xl border flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                                         (Array.isArray(item.finishedVideoUrl) ? item.finishedVideoUrl.length > 0 : !!item.finishedVideoUrl) 
                                           ? 'bg-green-500/10 border-green-500/30 text-green-500 hover:bg-green-500/20' 
                                           : 'bg-orange-500/10 border-orange-500/30 text-orange-500 hover:bg-orange-500/20'
                                       } ${uploadingItem?.id === item.id ? 'opacity-50 cursor-wait' : ''}`}
                                     >
                                       {uploadingItem?.id === item.id && uploadingItem?.type === 'finished' ? (
                                          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                       ) : (
                                          <CloudUpload className="w-3 h-3" />
                                       )}
                                       {uploadingItem?.id === item.id && uploadingItem?.type === 'finished' ? 'Carregando...' : ((Array.isArray(item.finishedVideoUrl) ? item.finishedVideoUrl.length > 0 : !!item.finishedVideoUrl) ? 'Atualizar' : 'Enviar Vídeo')}
                                     </button>
                                     {finishedVideos.length > 0 && !uploadingItem && (
                                       <>
                                         <button
                                           onClick={() => {
                                             const file = finishedVideos[0] as any;
                                             const url = typeof file === 'string' ? file : file.url;
                                             const name = typeof file === 'string' ? 'Video pronto' : (file.name || 'Video pronto');
                                             setActivePreviewVideo({ url, name, type: 'video' });
                                           }}
                                           className="p-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-green-500 hover:text-green-400"
                                           title="Reproduzir video pronto"
                                         >
                                           <Play className="w-4 h-4" />
                                         </button>
                                         {userRole === 'editor' && (
                                           <button
                                             onClick={() => {
                                               const file = finishedVideos[0] as any;
                                               const url = typeof file === 'string' ? file : file.url;
                                               handleDeleteAsset(item, 'finished', url);
                                             }}
                                             className="p-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-red-500 hover:text-red-400"
                                             title="Excluir video pronto"
                                           >
                                             <Trash2 className="w-4 h-4" />
                                           </button>
                                         )}
                                       </>
                                     )}
                                   </div>
                                </td>
                                {userRole !== 'editor' && (
                                  <td data-label="Status" className="px-6 py-4 text-right">
                                     <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full border ${
                                       item.status === ScheduleStatus.PRODUCED 
                                         ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                                         : 'bg-orange-500/10 text-orange-500 border-orange-500/20'
                                     }`}>
                                       {item.status}
                                     </span>
                                  </td>
                                )}
                              </>
                            )}
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Contents Archive Section */}
              <div className="mt-12 space-y-8">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-orange-500/10 rounded-2xl text-orange-500 border border-orange-500/20">
                    <Folder className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xl font-black text-white uppercase tracking-tight italic">Cofre de Conteúdos</h4>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Materiais organizados por data de produção</p>
                  </div>
                </div>

                <div className="space-y-16">
                  {(Object.entries(groupedByDate) as [string, ScheduleItem[]][]).map(([date, items]) => {
                    const audioPairs = items.flatMap(item => {
                      const arr = Array.isArray(item.audioMaterial) ? item.audioMaterial : (item.audioMaterial ? [item.audioMaterial] : []);
                      return arr.map(file => ({ file, item }));
                    });
                    const videoPairs = items.flatMap(item => {
                      const arr = Array.isArray(item.videoMaterial) ? item.videoMaterial : (item.videoMaterial ? [item.videoMaterial] : []);
                      return arr.map(file => ({ file, item }));
                    });
                    const finishedPairs = items.flatMap(item => {
                      const arr = Array.isArray(item.finishedVideoUrl) ? item.finishedVideoUrl : (item.finishedVideoUrl ? [item.finishedVideoUrl] : []);
                      return arr.map(file => ({ file, item }));
                    });

                    return (
                      <div key={date} className="space-y-8">
                        <div className="flex items-center gap-4">
                          <div className="w-1.5 h-8 bg-orange-500 rounded-full" />
                          <h5 className="text-2xl font-black text-white italic">{new Date(date + 'T00:00:00').toLocaleDateString('pt-BR')}</h5>
                          <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-[9px] font-black text-gray-400 uppercase">
                            {audioPairs.length + videoPairs.length + finishedPairs.length} arquivos
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 pl-6">
                           {audioPairs.length > 0 && (
                             <div className="space-y-4">
                               <div className="flex items-center gap-2 text-blue-500">
                                 <div className="p-2 bg-blue-500/10 rounded-lg">
                                   <Music className="w-4 h-4" />
                                 </div>
                                 <span className="text-xs font-black uppercase tracking-widest">Áudios Base</span>
                               </div>
                               <div className="flex flex-col gap-2">
                                 {audioPairs.map((pair: any, idx) => {
                                   const url = typeof pair.file === 'string' ? pair.file : pair.file.url;
                                   const name = typeof pair.file === 'string' ? `Áudio #${idx + 1}` : pair.file.name;
                                   return (
                                     <div key={idx} className="flex items-center justify-between p-4 bg-[#141414] border border-[#222] rounded-2xl group/link hover:border-blue-500/50 transition-all">
                                        <a href={url} target="_blank" rel="noreferrer" className="flex-1 truncate text-sm font-bold text-gray-400 hover:text-white mr-2 transition-colors" title={name}>
                                          {name}
                                        </a>
                                        <div className="flex items-center gap-1.5">
                                          <a href={url} target="_blank" rel="noreferrer" className="p-1 text-gray-500 hover:text-blue-500 rounded transition-colors">
                                            <Download className="w-4 h-4" />
                                          </a>
                                          {isPartner && (
                                            <button 
                                              onClick={() => handleDeleteAsset(pair.item, 'audio', url)}
                                              className="p-1 text-gray-500 hover:text-red-500 rounded transition-colors"
                                              title="Excluir"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          )}
                                        </div>
                                     </div>
                                   );
                                 })}
                               </div>
                             </div>
                           )}

                           {videoPairs.length > 0 && (
                             <div className="space-y-4">
                               <div className="flex items-center gap-2 text-purple-500">
                                 <div className="p-2 bg-purple-500/10 rounded-lg">
                                   <Video className="w-4 h-4" />
                                 </div>
                                 <span className="text-xs font-black uppercase tracking-widest">Materiais Brutos</span>
                               </div>
                               <div className="flex flex-col gap-2">
                                 {videoPairs.map((pair: any, idx) => {
                                   const url = typeof pair.file === 'string' ? pair.file : pair.file.url;
                                   const name = typeof pair.file === 'string' ? `Bruto #${idx + 1}` : pair.file.name;
                                   return (
                                     <div key={idx} className="flex items-center justify-between p-4 bg-[#141414] border border-[#222] rounded-2xl group/link hover:border-purple-500/50 transition-all">
                                        <a href={url} target="_blank" rel="noreferrer" className="flex-1 truncate text-sm font-bold text-gray-400 hover:text-white mr-2 transition-colors" title={name}>
                                          {name}
                                        </a>
                                        <div className="flex items-center gap-1.5">
                                          <a href={url} target="_blank" rel="noreferrer" className="p-1 text-gray-500 hover:text-purple-500 rounded transition-colors">
                                            <Download className="w-4 h-4" />
                                          </a>
                                          {isPartner && (
                                            <button 
                                              onClick={() => handleDeleteAsset(pair.item, 'video', url)}
                                              className="p-1 text-gray-500 hover:text-red-500 rounded transition-colors"
                                              title="Excluir"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          )}
                                        </div>
                                     </div>
                                   );
                                 })}
                               </div>
                             </div>
                           )}

                           {finishedPairs.length > 0 && (
                             <div className="space-y-4">
                               <div className="flex items-center gap-2 text-green-500">
                                 <div className="p-2 bg-green-500/10 rounded-lg">
                                   <CheckCircle className="w-4 h-4" />
                                 </div>
                                 <span className="text-xs font-black uppercase tracking-widest">Vídeos Prontos</span>
                               </div>
                               <div className="flex flex-col gap-2">
                                 {finishedPairs.map((pair: any, idx) => {
                                   const url = typeof pair.file === 'string' ? pair.file : pair.file.url;
                                   const name = typeof pair.file === 'string' ? `Vídeo Final #${idx + 1}` : pair.file.name;
                                   return (
                                     <div key={idx} className="flex items-center justify-between p-4 bg-green-500/5 border border-green-500/10 rounded-2xl group/link hover:border-green-500 hover:bg-green-500/10 transition-all">
                                        <button 
                                          onClick={() => setActivePreviewVideo({ url, name, type: 'video' })}
                                          className="flex-1 text-left truncate text-sm font-bold text-green-500/70 hover:text-green-500 mr-2 transition-colors cursor-pointer" 
                                          title={name}
                                        >
                                          {name}
                                        </button>
                                        <div className="flex items-center gap-1.5">
                                          <button 
                                            onClick={() => setActivePreviewVideo({ url, name, type: 'video' })}
                                            className="p-1.5 text-green-500/50 hover:text-green-500 bg-green-500/5 rounded-xl border border-green-500/10 hover:bg-green-500/20 transition-all cursor-pointer"
                                            title="Reproduzir Vídeo"
                                          >
                                            <Play className="w-4 h-4" />
                                          </button>
                                          {(isPartner || userRole === 'editor') && (
                                            <button 
                                              onClick={() => handleDeleteAsset(pair.item, 'finished', url)}
                                              className="p-1 text-gray-500 hover:text-red-500 rounded transition-colors"
                                              title="Excluir"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          )}
                                        </div>
                                     </div>
                                   );
                                 })}
                               </div>
                             </div>
                           )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {Object.keys(groupedByDate).length === 0 && (
                  <div className="py-20 bg-[#141414]/50 border-2 border-dashed border-[#222] rounded-[3rem] text-center flex flex-col items-center gap-4">
                    <Archive className="w-12 h-12 text-gray-800" />
                    <div className="space-y-1">
                      <p className="text-gray-500 font-bold uppercase text-xs tracking-widest">O cofre está vazio</p>
                      <p className="text-[10px] text-gray-700 font-medium uppercase">Os conteúdos aparecerão aqui após o upload.</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          </motion.div>
        )}

        {/* VIEW 4: Library View */}
        {subView === 'library' && (
          <motion.div 
            key="library-content" 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-8"
          >
            {/* Meta statistics row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="bg-[#141414] border border-[#222] p-6 rounded-[2rem] flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Áudios Base</p>
                  <h4 className="text-3xl font-black text-white italic mt-1 font-mono">
                    {allLibraryAssets.filter(a => a.type === 'audio').length}
                  </h4>
                </div>
                <div className="p-4 bg-blue-500/10 rounded-2xl text-blue-500 border border-blue-500/20">
                  <Music className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-[#141414] border border-[#222] p-6 rounded-[2rem] flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Materiais Brutos</p>
                  <h4 className="text-3xl font-black text-white italic mt-1 font-mono">
                    {allLibraryAssets.filter(a => a.type === 'video').length}
                  </h4>
                </div>
                <div className="p-4 bg-purple-500/10 rounded-2xl text-purple-500 border border-purple-500/20">
                  <Video className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-[#141414] border border-[#222] p-6 rounded-[2rem] flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Vídeos Prontos</p>
                  <h4 className="text-3xl font-black text-white italic mt-1 font-mono">
                    {allLibraryAssets.filter(a => a.type === 'finished').length}
                  </h4>
                </div>
                <div className="p-4 bg-green-500/10 rounded-2xl text-green-500 border border-green-500/20">
                  <CheckCircle className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Filter controls */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center bg-[#141414] border border-[#222] p-4 rounded-3xl">
              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'audio', 'video', 'finished'] as const).map(type => {
                  const label = type === 'all' ? 'Todos' : type === 'audio' ? 'Áudios' : type === 'video' ? 'Materiais Brutos' : 'Vídeos Prontos';
                  const active = libraryTypeFilter === type;
                  return (
                    <button
                      key={type}
                      onClick={() => setLibraryTypeFilter(type)}
                      className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                        active 
                          ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/20' 
                          : 'bg-[#0a0a0a] text-gray-400 border border-[#222] hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="relative flex-1 md:max-w-md">
                <Search className="w-4 h-4 text-gray-600 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por produto, arquivo ou data..."
                  value={librarySearchQuery}
                  onChange={e => setLibrarySearchQuery(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl pl-11 pr-4 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                />
              </div>
            </div>

            {/* Table display */}
            <div className="bg-[#141414] border border-[#222] rounded-[2.5rem] overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#222] bg-[#1a1a1a]/50">
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-500 tracking-widest">Produto / Data</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-500 tracking-widest">Tipo</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-500 tracking-widest">Nome do Arquivo</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-500 tracking-widest text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222]">
                  {filteredLibraryAssets.map((asset, idx) => {
                    const typeConfig = {
                      audio: { label: 'Áudio Base', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
                      video: { label: 'Material Bruto', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
                      finished: { label: 'Vídeo Final', color: 'bg-green-500/10 text-green-500 border-green-500/20' }
                    };
                    const typeInfo = typeConfig[asset.type] || { label: asset.type, color: 'bg-gray-500/10 text-gray-500' };

                    return (
                      <tr key={idx} className="hover:bg-[#1a1a1a]/50 transition-colors">
                        <td data-label="Produto / Data" className="px-6 py-4">
                          <div>
                            <p className="text-sm font-bold text-white">{asset.productName}</p>
                            <p className="text-[10px] text-gray-500 font-bold uppercase mt-0.5">
                              {new Date(asset.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                        </td>
                        <td data-label="Tipo" className="px-6 py-4">
                          <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full border ${typeInfo.color}`}>
                            {typeInfo.label}
                          </span>
                        </td>
                        <td data-label="Arquivo" className="px-6 py-4 max-w-xs truncate">
                          <a 
                            href={asset.url} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-xs font-medium text-gray-400 hover:text-white transition-colors truncate block"
                            title={asset.name}
                          >
                            {asset.name}
                          </a>
                        </td>
                        <td data-label="Acoes" className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <a 
                              href={asset.url} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="p-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-gray-400 hover:text-white transition-all hover:border-gray-500"
                              title="Visualizar / Baixar"
                            >
                              {asset.type === 'finished' ? (
                                <ExternalLink className="w-4 h-4" />
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                            </a>
                            <button
                              onClick={() => handleDeleteAsset(asset.item, asset.type, asset.url)}
                              className="p-2 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 rounded-xl text-gray-500 hover:text-red-500 transition-all hover:border-red-500/20"
                              title="Remover permanentemente"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredLibraryAssets.length === 0 && (
                <div className="py-24 text-center flex flex-col items-center gap-4 bg-[#0a0a0a]/50">
                  <Archive className="w-12 h-12 text-gray-800" />
                  <div className="space-y-1">
                    <p className="text-gray-500 font-bold uppercase text-xs tracking-widest">Nenhum arquivo encontrado</p>
                    <p className="text-[10px] text-gray-700 font-medium uppercase">Tente alterar seu filtro de busca ou categoria.</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* VIEW 2: Editors/Suppliers (Folders Grid) */}
        {(subView === 'editors' || subView === 'suppliers') && (
          <motion.div key="editors-content" className="space-y-12">
            {!activeProducerId && (
              <>
                {subView === 'editors' && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-6 bg-orange-500 rounded-full" />
                      <h4 className="text-xl font-black text-white italic uppercase tracking-tight">Editores</h4>
                    </div>
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6"
                    >
                      {producers.filter(p => isProducerAvailableForRole(p, 'editor')).map(p => (
                        <div key={p.id} className="relative group">
                          <button
                            onClick={() => {
                              setActiveProducerId(p.id);
                              setActiveRole('editor');
                            }}
                            className="w-full flex flex-col items-center gap-4 p-8 bg-[#141414] border border-[#222] rounded-[2.5rem] hover:border-orange-500/50 transition-all text-center group relative overflow-hidden"
                          >
                            <div className="absolute inset-0 bg-gradient-to-b from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="relative w-24 h-24 flex items-center justify-center">
                              <div className="absolute inset-0 bg-orange-500/10 rounded-full blur-2xl group-hover:bg-orange-500/20 transition-all" />
                              <UserCircle className="w-20 h-20 text-orange-500/30 group-hover:text-orange-500/60 transition-all relative z-10" />
                            </div>
                            <div className="space-y-1 relative z-10">
                              <p className="text-white font-black text-sm uppercase tracking-widest">{p.name}</p>
                              <p className="text-[10px] text-gray-500 font-bold uppercase">{getProducerStatusLabel(p, 'editor')}</p>
                              {getProducerLinkedEmail(p) && <p className="text-[9px] text-orange-500 font-black uppercase truncate max-w-[120px]">{getProducerLinkedEmail(p)}</p>}
                            </div>
                            <div className="bg-[#0a0a0a] px-4 py-1.5 rounded-full border border-[#222] text-[9px] font-black text-orange-500 uppercase tracking-tighter relative z-10">
                              {pendingProduction.filter(s => s.producerId === p.id).length} PRODUÇÕES
                            </div>
                          </button>
                          
                          <div className="absolute top-4 right-4 z-10">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpenId(menuOpenId === p.id ? null : p.id);
                              }}
                              className="p-2 bg-black/40 hover:bg-black/60 rounded-full text-gray-400 hover:text-white transition-all backdrop-blur-sm"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            
                            <AnimatePresence>
                              {menuOpenId === p.id && (
                                <motion.div 
                                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                  className="absolute right-0 mt-2 w-40 bg-[#1a1a1a] border border-[#222] rounded-2xl shadow-2xl overflow-hidden py-2"
                                >
                                  <button 
                                    onClick={() => {
                                      setEditingProducer(p);
                                      setNewProducerName(p.name);
                                      setEditingProducerRole(p.role || 'editor');
                                      setMenuOpenId(null);
                                    }}
                                    className={`w-full px-4 py-2 text-left text-[10px] font-black uppercase hover:bg-white/5 transition-colors flex items-center gap-2 ${getProducerLinkedUserId(p) || getProducerLinkedEmail(p) ? 'text-red-500 hover:text-red-400' : 'text-gray-400 hover:text-white'}`}
                                  >
                                    <Pencil className="w-3 h-3" />
                                    Configurar Perfil
                                  </button>
                                  <button 
                                    onClick={() => {
                                      if (getProducerLinkedUserId(p) || getProducerLinkedEmail(p)) {
                                        handleUnlinkUser(p);
                                      } else {
                                        setShowLinkModal({ ...p, role: 'editor' });
                                        setLinkEmail('');
                                        setMenuOpenId(null);
                                      }
                                    }}
                                    className={`w-full px-4 py-2 text-left text-[10px] font-black uppercase hover:bg-white/5 transition-colors flex items-center gap-2 ${getProducerLinkedUserId(p) || getProducerLinkedEmail(p) ? 'text-red-500 hover:text-red-400' : 'text-gray-400 hover:text-white'}`}
                                  >
                                    <UserIcon className="w-3 h-3" />
                                    {getProducerLinkedUserId(p) || getProducerLinkedEmail(p) ? 'Desvincular' : 'Vincular Usuário'}
                                  </button>
                                  <button 
                                    onClick={() => toggleHideProducer(p)}
                                    className="w-full px-4 py-2 text-left text-[10px] font-black uppercase text-gray-400 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                                  >
                                    <EyeOff className="w-3 h-3" />
                                    Ocultar
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteProducer(p.id)}
                                    className="w-full px-4 py-2 text-left text-[10px] font-black uppercase text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    Excluir
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  </div>
                )}
  
                {subView === 'suppliers' && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-6 bg-blue-500 rounded-full" />
                      <h4 className="text-xl font-black text-white italic uppercase tracking-tight">Fornecedores</h4>
                    </div>
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6"
                    >
                      {producers.filter(p => isProducerAvailableForRole(p, 'supplier')).map(p => (
                        <div key={p.id} className="relative group">
                          <button
                            onClick={() => {
                              setActiveProducerId(p.id);
                              setActiveRole('supplier');
                            }}
                            className="w-full flex flex-col items-center gap-4 p-8 bg-[#141414] border border-[#222] rounded-[2.5rem] hover:border-blue-500/50 transition-all text-center group relative overflow-hidden"
                          >
                            <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="relative w-24 h-24 flex items-center justify-center">
                              <div className="absolute inset-0 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all" />
                              <UserCircle className="w-20 h-20 text-blue-500/30 group-hover:text-blue-500/60 transition-all relative z-10" />
                            </div>
                            <div className="space-y-1 relative z-10">
                              <p className="text-white font-black text-sm uppercase tracking-widest">{p.name}</p>
                              <p className="text-[10px] text-gray-500 font-bold uppercase">{getProducerStatusLabel(p, 'supplier')}</p>
                              {getProducerLinkedEmail(p) && <p className="text-[9px] text-blue-500 font-black uppercase truncate max-w-[120px]">{getProducerLinkedEmail(p)}</p>}
                            </div>
                            <div className="bg-[#0a0a0a] px-4 py-1.5 rounded-full border border-[#222] text-[9px] font-black text-blue-500 uppercase tracking-tighter relative z-10">
                              {pendingProduction.filter(s => s.supplierId === p.id).length} ENCARGOS
                            </div>
                          </button>

                          <div className="absolute top-4 right-4 z-10">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpenId(menuOpenId === p.id ? null : p.id);
                              }}
                              className="p-2 bg-black/40 hover:bg-black/60 rounded-full text-gray-400 hover:text-white transition-all backdrop-blur-sm"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            
                            <AnimatePresence>
                              {menuOpenId === p.id && (
                                <motion.div 
                                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                  className="absolute right-0 mt-2 w-40 bg-[#1a1a1a] border border-[#222] rounded-2xl shadow-2xl overflow-hidden py-2"
                                >
                                  <button 
                                    onClick={() => {
                                      setEditingProducer(p);
                                      setNewProducerName(p.name);
                                      setEditingProducerRole(p.role || 'supplier');
                                      setMenuOpenId(null);
                                    }}
                                    className="w-full px-4 py-2 text-left text-[10px] font-black uppercase text-gray-400 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                                  >
                                    <Pencil className="w-3 h-3" />
                                    Configurar Perfil
                                  </button>
                                  <button 
                                    onClick={() => {
                                      if (getProducerLinkedUserId(p) || getProducerLinkedEmail(p)) {
                                        handleUnlinkUser(p);
                                      } else {
                                        setShowLinkModal({ ...p, role: 'supplier' });
                                        setLinkEmail('');
                                        setMenuOpenId(null);
                                      }
                                    }}
                                    className={`w-full px-4 py-2 text-left text-[10px] font-black uppercase hover:bg-white/5 transition-colors flex items-center gap-2 ${getProducerLinkedUserId(p) || getProducerLinkedEmail(p) ? 'text-red-500 hover:text-red-400' : 'text-gray-400 hover:text-white'}`}
                                  >
                                    <UserIcon className="w-3 h-3" />
                                    {getProducerLinkedUserId(p) || getProducerLinkedEmail(p) ? 'Desvincular' : 'Vincular Usuário'}
                                  </button>
                                  <button 
                                    onClick={() => toggleHideProducer(p)}
                                    className="w-full px-4 py-2 text-left text-[10px] font-black uppercase text-gray-400 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                                  >
                                    <EyeOff className="w-3 h-3" />
                                    Ocultar
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteProducer(p.id)}
                                    className="w-full px-4 py-2 text-left text-[10px] font-black uppercase text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    Excluir
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  </div>
                )}
              </>
            )}

            {/* Step 2: Product Folders / Profile View */}
            {activeProducerId && !activeProductId && (
              <motion.div 
                key="profile-view"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="w-full space-y-8"
              >
                {activeProducerId === 'unassigned' ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {pendingProduction.filter(s => activeRole === 'supplier' ? !s.supplierId : !s.producerId).map(item => {
                      const prod = products.find(p => p.id === item.productId);
                      const acc = accounts.find(a => a.id === item.accountId);
                      return (
                        <div key={item.id} className="bg-[#141414] border border-[#222] p-6 rounded-[2.5rem] space-y-4">
                          <div>
                            <h4 className="text-white font-bold">{prod?.name}</h4>
                            <p className="text-[10px] text-gray-500 font-bold uppercase">{acc?.name}</p>
                          </div>
                          <select 
                            className={`w-full bg-[#0a0a0a] border border-[#222] rounded-xl px-4 py-2 text-[10px] font-black uppercase text-gray-400 cursor-pointer ${activeRole === 'supplier' ? 'focus:border-blue-500' : 'focus:border-orange-500'}`}
                            onChange={(e) => handleAssignRole(item.id, e.target.value, activeRole || 'editor')}
                            value=""
                          >
                            <option value="">Atribuir {activeRole === 'supplier' ? 'Fornecedor' : 'Editor'}...</option>
                            {producers.filter(p => isProducerAvailableForRole(p, activeRole === 'supplier' ? 'supplier' : 'editor')).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-8">
                    {(() => {
                      const colabScheduleIds = schedule
                        .filter(s => activeRole === 'supplier' ? s.supplierId === activeProducerId : s.producerId === activeProducerId)
                        .map(s => s.id);
                      const colabSales = sales.filter(sale => sale.scheduleItemId && colabScheduleIds.includes(sale.scheduleItemId));
                      
                      const totalSalesQty = colabSales.reduce((sum, curr) => sum + (curr.quantity || 0), 0);
                      const totalSalesGmvVal = colabSales.reduce((sum, curr) => sum + (curr.gmv || 0), 0);

                      const dynamicEfficiency = Math.min(100, Math.round(85 + Math.min(15, totalSalesQty * 2)));
                      const dynamicQuality = Math.min(100, Math.round(92 + Math.min(8, totalSalesQty * 0.5)));

                      return (
                        <>
                          {/* Profile Stats Header - 4 Columns */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className={`bg-gradient-to-br border p-8 rounded-[2.5rem] relative overflow-hidden group ${activeRole === 'supplier' ? 'from-blue-500/10 to-blue-500/5 border-blue-500/20' : 'from-orange-500/10 to-orange-500/5 border-orange-500/20'}`}>
                              <Trophy className={`absolute -right-4 -bottom-4 w-32 h-32 -rotate-12 group-hover:scale-110 transition-transform ${activeRole === 'supplier' ? 'text-blue-500/10' : 'text-orange-500/10'}`} />
                              <div className="relative z-10 space-y-2">
                                 <p className={`text-[10px] font-black uppercase tracking-widest ${activeRole === 'supplier' ? 'text-blue-500' : 'text-orange-500'}`}>
                                   {activeRole === 'supplier' ? 'Materiais Preparados' : 'Total Produzido'}
                                 </p>
                                 <h4 className="text-5xl font-black text-white italic">
                                   {schedule.filter(s => (activeRole === 'supplier' ? s.supplierId === activeProducerId : s.producerId === activeProducerId) && s.status === (activeRole === 'supplier' ? ScheduleStatus.PRODUCED : ScheduleStatus.POSTED)).length}
                                 </h4>
                                 <p className="text-xs text-gray-500 font-bold">{activeRole === 'supplier' ? 'Itens com material entregue' : 'Vídeos finalizados e publicados'}</p>
                              </div>
                            </div>

                            <div className="bg-[#141414] border border-[#222] p-8 rounded-[2.5rem] relative overflow-hidden group">
                              <Zap className="absolute -right-4 -bottom-4 w-32 h-32 text-blue-500/5 -rotate-12 group-hover:scale-110 transition-transform" />
                              <div className="relative z-10 space-y-2">
                                 <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Ativos Hoje</p>
                                 <h4 className="text-5xl font-black text-white italic">
                                   {schedule.filter(s => (activeRole === 'supplier' ? s.supplierId === activeProducerId : s.producerId === activeProducerId) && s.date === todayStr && s.status !== ScheduleStatus.POSTED).length}
                                 </h4>
                                 <p className="text-xs text-gray-500 font-bold">Conteúdos em processamento</p>
                              </div>
                            </div>

                            <div className="bg-[#141414] border border-[#222] p-8 rounded-[2.5rem] relative overflow-hidden group">
                              <Star className="absolute -right-4 -bottom-4 w-32 h-32 text-yellow-500/5 -rotate-12 group-hover:scale-110 transition-transform" />
                              <div className="relative z-10 space-y-2">
                                 <p className="text-[10px] font-black text-yellow-500 uppercase tracking-widest">Nível de {activeRole === 'supplier' ? 'Fornecedor' : 'Editor'}</p>
                                 <h4 className="text-5xl font-black text-white italic">
                                   {Math.floor(schedule.filter(s => (activeRole === 'supplier' ? s.supplierId === activeProducerId : s.producerId === activeProducerId) && s.status === (activeRole === 'supplier' ? ScheduleStatus.PRODUCED : ScheduleStatus.POSTED)).length / 10) + 1}
                                 </h4>
                                 <p className="text-xs text-gray-500 font-bold">Baseado em volume de entrega</p>
                              </div>
                            </div>

                            <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20 p-8 rounded-[2.5rem] relative overflow-hidden group">
                              <BarChart3 className="absolute -right-4 -bottom-4 w-32 h-32 text-green-500/10 -rotate-12 group-hover:scale-110 transition-transform" />
                              <div className="relative z-10 space-y-2">
                                 <p className="text-[10px] font-black text-green-500 uppercase tracking-widest">Vendas Geradas</p>
                                 <h4 className="text-5xl font-black text-white italic">
                                   {totalSalesQty}
                                 </h4>
                                 <p className="text-xs text-gray-500 font-bold">
                                   GMV: R$ {totalSalesGmvVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                 </p>
                              </div>
                            </div>
                          </div>

                          {/* Performance Row */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                             <div className="bg-[#0a0a0a] border border-[#222] p-8 rounded-[2.5rem] space-y-6">
                               <div className="flex items-center justify-between">
                                  <h5 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                                    <Target className="w-4 h-4 text-orange-500" />
                                    Desempenho Geral
                                  </h5>
                               </div>
                               <div className="space-y-4">
                                  <div className="space-y-2">
                                     <div className="flex justify-between text-[10px] font-black uppercase text-gray-500">
                                        <span>Eficiência</span>
                                        <span className="text-white">{dynamicEfficiency}%</span>
                                     </div>
                                     <div className="h-1.5 w-full bg-[#141414] rounded-full overflow-hidden">
                                        <div className="h-full bg-orange-500 rounded-full" style={{ width: `${dynamicEfficiency}%` }} />
                                     </div>
                                  </div>
                                  <div className="space-y-2">
                                     <div className="flex justify-between text-[10px] font-black uppercase text-gray-500">
                                        <span>Qualidade</span>
                                        <span className="text-white">{dynamicQuality}%</span>
                                     </div>
                                     <div className="h-1.5 w-full bg-[#141414] rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${dynamicQuality}%` }} />
                                     </div>
                                  </div>
                               </div>
                             </div>

                             <div className="bg-[#0a0a0a] border border-[#222] p-8 rounded-[2.5rem] space-y-4 flex flex-col justify-between">
                               <div className="flex items-center justify-between border-b border-[#222] pb-3">
                                 <h5 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                                   <TrendingUp className="w-4 h-4 text-green-500" />
                                   Histórico de Vendas por Vídeo
                                 </h5>
                                 <span className="text-[10px] font-black uppercase text-gray-500">{colabSales.length} registros</span>
                               </div>
                               <div className="flex-1 overflow-y-auto max-h-[180px] space-y-3 pr-2 no-scrollbar">
                                 {colabSales.length > 0 ? (
                                   colabSales.map((sale, i) => {
                                     const prod = products.find(p => p.id === sale.productId);
                                     const acc = accounts.find(a => a.id === sale.accountId);
                                     const schedItem = schedule.find(s => s.id === sale.scheduleItemId);
                                     const videoName = schedItem ? videoDisplayNames[schedItem.id] : 'Vídeo';

                                     return (
                                       <div key={sale.id || i} className="flex items-center justify-between p-3.5 bg-[#141414] border border-[#222] rounded-2xl text-xs">
                                         <div className="min-w-0">
                                           <p className="font-bold text-white truncate">{prod?.name || 'Produto'}</p>
                                           <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider">
                                             <span className="truncate">{acc?.name}</span>
                                             <span>•</span>
                                             <span className="text-orange-500 font-mono font-bold bg-orange-500/5 px-1.5 py-0.5 rounded border border-orange-500/10 shrink-0">Vídeo nº {videoName}</span>
                                           </div>
                                         </div>
                                         <div className="text-right shrink-0 ml-4">
                                           <p className="font-black text-green-500">R$ {sale.gmv.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                           <p className="text-[10px] text-gray-400 mt-0.5">{sale.quantity} {sale.quantity === 1 ? 'venda' : 'vendas'}</p>
                                         </div>
                                       </div>
                                     );
                                   })
                                 ) : (
                                   <div className="flex flex-col items-center justify-center py-6 text-gray-600 italic">
                                     <DollarSign className="w-8 h-8 opacity-25 mb-1" />
                                     <span className="text-xs">Nenhuma venda convertida por este colaborador ainda</span>
                                   </div>
                                 )}
                               </div>
                             </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 3: Tasks in Product Folder */}
            {activeProducerId && activeProductId && (
              <motion.div 
                key="tasks"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-[#141414] border border-[#222] rounded-[2.5rem] p-8 space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-2xl ${activeRole === 'supplier' ? 'bg-blue-500/10 text-blue-500' : 'bg-purple-500/10 text-purple-500'}`}>
                          <ClipboardList className="w-6 h-6" />
                        </div>
                        <h4 className="text-xl font-black text-white uppercase tracking-tight">
                          {activeRole === 'supplier' ? 'Preparo de Materiais' : 'Materiais de Apoio'}
                        </h4>
                      </div>
                      <button 
                        onClick={() => {
                          const firstItem = pendingProduction.find(s => (activeRole === 'supplier' ? s.supplierId === activeProducerId : s.producerId === activeProducerId) && s.productId === activeProductId);
                          setPrepData({
                            audio: Array.isArray(firstItem?.audioMaterial) 
                              ? (firstItem.audioMaterial as any[]).map(m => typeof m === 'string' ? m : m.url).join(', ') 
                              : (firstItem?.audioMaterial as any || ''),
                            video: Array.isArray(firstItem?.videoMaterial) 
                              ? (firstItem.videoMaterial as any[]).map(m => typeof m === 'string' ? m : m.url).join(', ') 
                              : (firstItem?.videoMaterial as any || ''),
                            notes: firstItem?.productionNotes || ''
                          });
                          setPrepModal({ productId: activeProductId, producerId: activeProducerId });
                        }}
                        className={`text-[10px] font-black uppercase hover:opacity-80 transition-opacity ${activeRole === 'supplier' ? 'text-blue-500' : 'text-orange-500'}`}
                      >
                        {activeRole === 'supplier' ? 'Subir Materiais' : 'Editar Materiais'}
                      </button>
                    </div>

                    <div className="space-y-4">
                      {['audio', 'video'].map(type => {
                        const firstItem = pendingProduction.find(s => (activeRole === 'supplier' ? s.supplierId === activeProducerId : s.producerId === activeProducerId) && s.productId === activeProductId);
                        const rawVal = type === 'audio' ? firstItem?.audioMaterial : firstItem?.videoMaterial;
                        const urls = Array.isArray(rawVal) ? rawVal : (rawVal ? [rawVal] : []);

                        return (
                          <div key={type} className="flex items-start gap-4 p-4 bg-[#0a0a0a] border border-[#222] rounded-2xl group">
                            {type === 'audio' ? <Music className="w-5 h-5 text-purple-500" /> : <Video className="w-5 h-5 text-blue-500" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-black text-gray-500 uppercase mb-1">{type === 'audio' ? 'Áudio Base' : 'Vídeo/Material Bruto'}</p>
                              {urls.length > 0 ? (
                                <div className="space-y-1">
                                  {urls.map((u: any, idx: number) => {
                                    const url = typeof u === 'string' ? u : u.url;
                                    const name = typeof u === 'string' ? `Material #${idx + 1}` : u.name;
                                    return (
                                      <a key={idx} href={url} target="_blank" rel="noreferrer" className="text-sm text-white font-bold hover:text-orange-500 truncate block flex items-center gap-2">
                                        <span className="truncate">{name}</span>
                                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                      </a>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-600 italic">Ainda não configurado</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      
                      <div className="p-4 bg-[#0a0a0a] border border-[#222] rounded-2xl">
                        <p className="text-[10px] font-black text-gray-500 uppercase mb-2">Observações de Produção</p>
                        <p className="text-sm text-gray-400 leading-relaxed">
                          {pendingProduction.find(s => (activeRole === 'supplier' ? s.supplierId === activeProducerId : s.producerId === activeProducerId) && s.productId === activeProductId)?.productionNotes || 'Nenhuma observação adicionada.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {activeRole !== 'supplier' && (
                    <div className="bg-[#141414] border border-[#222] rounded-[2.5rem] p-8 space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-orange-500/10 rounded-2xl text-orange-500">
                          <FileVideo className="w-6 h-6" />
                        </div>
                        <h4 className="text-xl font-black text-white uppercase tracking-tight">Vídeos Prontos</h4>
                      </div>
                      
                      <p className="text-sm text-gray-500 font-medium">Finalizou o vídeo? Clique no botão abaixo para subir e escolher qual conta será postada.</p>
                      
                      <button 
                        onClick={() => setCompletionModal({ productId: activeProductId, producerId: activeProducerId })}
                        className="w-full py-6 bg-white text-black rounded-3xl font-black text-sm uppercase tracking-widest hover:bg-orange-500 transition-all shadow-xl shadow-white/5"
                      >
                        Finalizar Novo Vídeo
                      </button>

                      <div className="space-y-3 pt-4">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Produzidos Hoje</p>
                        {pendingProduction.filter(s => s.producerId === activeProducerId && s.productId === activeProductId && s.status === ScheduleStatus.PRODUCED).map(item => {
                          const acc = accounts.find(a => a.id === item.accountId);
                          return (
                            <div key={item.id} className="flex items-center justify-between p-4 bg-[#0a0a0a] border border-[#222] rounded-2xl">
                               <div className="flex items-center gap-3">
                                 <div className="p-2 bg-green-500/10 rounded-lg text-green-500">
                                    <CheckCircle className="w-4 h-4" />
                                 </div>
                                 <span className="text-sm font-bold text-white">{acc?.name}</span>
                               </div>
                               <button 
                                 onClick={() => {
                                   const url = Array.isArray(item.finishedVideoUrl) ? item.finishedVideoUrl[0]?.url : (item.finishedVideoUrl as any)?.url || (item.finishedVideoUrl as string);
                                   const name = `Vídeo - ${acc?.name || 'Sem Conta'}`;
                                    setActivePreviewVideo({ url, name, type: 'video' });
                                 }}
                                 className="text-xs text-orange-500 hover:underline cursor-pointer font-bold"
                               >
                                 Ver Vídeo
                               </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden file inputs for uploads */}
      <input 
        type="file" 
        className="hidden" 
        ref={audioInputRef}
        accept="audio/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && activeUploadContext) {
            handleUploadFile(activeUploadContext.id, 'audio', file);
          }
          e.target.value = '';
        }}
      />
      <input 
        type="file" 
        className="hidden" 
        ref={videoInputRef}
        accept="video/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && activeUploadContext) {
            handleUploadFile(activeUploadContext.id, 'video', file);
          }
          e.target.value = '';
        }}
      />
      <input 
        type="file" 
        className="hidden" 
        ref={finishedInputRef}
        accept="video/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && activeUploadContext) {
            handleUploadFile(activeUploadContext.id, 'finished', file);
          }
          e.target.value = '';
        }}
      />

      {/* Modals */}
      <AnimatePresence>
         {showAddProducer && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowAddProducer(false)} />
             <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#141414] border border-[#222] p-8 rounded-[2.5rem] max-w-sm w-full relative z-10 space-y-6 text-center">
                <div className="w-16 h-16 bg-orange-500/10 rounded-3xl flex items-center justify-center mx-auto border border-orange-500/20 text-orange-500">
                  <UserCircle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-white uppercase italic tracking-tight">Novo Editor</h3>
                <input 
                  autoFocus
                  placeholder="Nome do Profissional..."
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-5 py-4 text-white outline-none focus:border-orange-500 font-bold"
                  value={newProducerName}
                  onChange={e => setNewProducerName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddProducer()}
                />
                <div className="flex gap-3">
                  <button onClick={() => setShowAddProducer(false)} className="flex-1 py-4 bg-[#1a1a1a] text-gray-500 rounded-2xl font-black text-xs uppercase hover:text-white">Cancelar</button>
                  <button onClick={handleAddProducer} className="flex-1 py-4 bg-orange-500 text-black rounded-2xl font-black text-xs uppercase hover:bg-orange-400">Salvar Profissional</button>
                </div>
             </motion.div>
          </div>
        )}

        {showLinkModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => { setShowLinkModal(null); setSelectedProfile(null); }} />
             <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#141414] border border-[#222] p-8 rounded-[2.5rem] max-w-sm w-full relative z-10 space-y-6">
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 bg-blue-500/10 rounded-3xl flex items-center justify-center mx-auto border border-blue-500/20 text-blue-500">
                    <UserIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white uppercase italic tracking-tight">Vincular Usuário</h3>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Ao colaborador {showLinkModal.name}</p>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-500">
                    <Search className="w-4 h-4" />
                  </div>
                  <input 
                    autoFocus
                    type="text"
                    placeholder="Buscar por nome ou e-mail..."
                    className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl pl-12 pr-5 py-4 text-white outline-none focus:border-blue-500 font-bold text-sm"
                    value={linkEmail}
                    onChange={e => setLinkEmail(e.target.value)}
                  />
                </div>

                <div className="max-h-[300px] overflow-y-auto pr-2 space-y-2 no-scrollbar">
                  {userProfiles
                    .filter(p => !linkEmail || p.displayName.toLowerCase().includes(linkEmail.toLowerCase()) || p.email.toLowerCase().includes(linkEmail.toLowerCase()))
                    .map(profile => (
                      <button
                        key={profile.id}
                        onClick={() => setSelectedProfile(profile)}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl bg-[#0a0a0a] border transition-all text-left group ${selectedProfile?.id === profile.id ? 'border-blue-500 bg-blue-500/10' : 'border-[#222] hover:border-blue-500/50 hover:bg-blue-500/5'}`}
                      >
                        <img 
                          src={profile.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.displayName)}`} 
                          className="w-8 h-8 rounded-full border border-[#222]" 
                          alt="" 
                          referrerPolicy="no-referrer" 
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white group-hover:text-blue-500 transition-colors truncate">{profile.displayName}</p>
                          <p className="text-[10px] text-gray-500 font-medium truncate">{profile.email}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${selectedProfile?.id === profile.id ? 'bg-blue-500 border-blue-500 text-white' : 'border-[#333] text-transparent'}`}>
                          <Check className="w-3 h-3" />
                        </div>
                      </button>
                    ))}
                  {userProfiles.length === 0 && (
                    <div className="py-8 text-center space-y-2">
                       <UsersIcon className="w-8 h-8 text-gray-700 mx-auto" />
                       <p className="text-[10px] text-gray-600 font-bold uppercase">Nenhum usuário encontrado</p>
                    </div>
                  )}
                </div>

                <p className="text-[9px] text-gray-600 font-medium uppercase leading-relaxed text-center">
                  Selecione o usuário que deseja vincular a este colaborador.
                </p>
                
                <div className="flex gap-3 pt-2">
                  <button onClick={() => { setShowLinkModal(null); setSelectedProfile(null); }} className="flex-2 py-4 bg-[#1a1a1a] text-gray-500 rounded-2xl font-black text-xs uppercase hover:text-white transition-colors">Cancelar</button>
                  <button 
                    onClick={handleLinkUser} 
                    disabled={!selectedProfile}
                    className="flex-3 py-4 bg-blue-500 disabled:bg-blue-500/20 disabled:text-blue-500/40 text-white rounded-2xl font-black text-xs uppercase hover:bg-blue-400 transition-all flex items-center justify-center gap-2"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Salvar Vínculo
                  </button>
                </div>
             </motion.div>
          </div>
        )}

        {editingProducer && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setEditingProducer(null)} />
             <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#141414] border border-[#222] p-8 rounded-[2.5rem] max-w-sm w-full relative z-10 space-y-6">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-orange-500/10 rounded-3xl flex items-center justify-center mx-auto border border-orange-500/20 text-orange-500">
                     <UserCircle className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-black text-white uppercase italic tracking-tight">Editar Colaborador</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Nome do Profissional</label>
                    <input 
                      autoFocus
                      className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-5 py-4 text-white outline-none focus:border-orange-500 font-bold"
                      value={newProducerName}
                      onChange={e => setNewProducerName(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Função</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => setEditingProducerRole('editor')}
                        className={`py-3 rounded-xl text-[10px] font-black uppercase transition-all ${editingProducerRole === 'editor' ? 'bg-orange-500 text-black' : 'bg-[#0a0a0a] text-gray-500 border border-[#222]'}`}
                      >
                        Editor
                      </button>
                      <button 
                        onClick={() => setEditingProducerRole('supplier')}
                        className={`py-3 rounded-xl text-[10px] font-black uppercase transition-all ${editingProducerRole === 'supplier' ? 'bg-blue-500 text-white' : 'bg-[#0a0a0a] text-gray-500 border border-[#222]'}`}
                      >
                        Fornecedor
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setEditingProducer(null)} className="flex-1 py-4 bg-[#1a1a1a] text-gray-500 rounded-2xl font-black text-xs uppercase hover:text-white">Cancelar</button>
                  <button onClick={handleRenameProducer} className="flex-1 py-4 bg-orange-500 text-black rounded-2xl font-black text-xs uppercase hover:bg-orange-400">Salvar Alterações</button>
                </div>
             </motion.div>
          </div>
        )}

        {showAddLineItem && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowAddLineItem(false)} />
             <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#141414] border border-[#222] p-8 rounded-[2.5rem] max-w-lg w-full relative z-10 space-y-6">
                <h3 className="text-2xl font-black text-white uppercase italic tracking-tight">
                  {(newItemData.producerId && activeProducerId && activeProducerId !== 'unassigned') ? 'Vincular Produto ao Editor' : 'Novo Item de Produção'}
                </h3>
                <div className="space-y-4">
                   <div className="space-y-2">
                     <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Produto</label>
                     <select 
                       className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-5 py-4 text-white outline-none focus:border-orange-500 font-bold"
                       value={newItemData.productId}
                       onChange={e => setNewItemData({ ...newItemData, productId: e.target.value })}
                     >
                       <option value="">Selecionar Produto...</option>
                       {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                     </select>
                   </div>
                   {!(newItemData.producerId && activeProducerId && activeProducerId !== 'unassigned') && (
                     <>
                       <div className="space-y-2">
                         <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Editor (Opcional)</label>
                         <select 
                           className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-5 py-4 text-white outline-none focus:border-orange-500 font-bold"
                           value={newItemData.producerId}
                           onChange={e => setNewItemData({ ...newItemData, producerId: e.target.value })}
                         >
                           <option value="">Sem Atribuição</option>
                           {producers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                         </select>
                       </div>
                       <div className="space-y-2">
                         <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Fornecedor (Opcional)</label>
                         <select 
                           className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-5 py-4 text-white outline-none focus:border-blue-500 font-bold"
                           value={newItemData.supplierId}
                           onChange={e => setNewItemData({ ...newItemData, supplierId: e.target.value })}
                         >
                           <option value="">Sem Atribuição</option>
                           {producers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                         </select>
                       </div>
                     </>
                   )}
                </div>
                <div className="flex gap-3 pt-4">
                   <button onClick={() => setShowAddLineItem(false)} className="flex-1 py-4 bg-[#1a1a1a] text-gray-500 rounded-2xl font-black text-xs uppercase hover:text-white">Cancelar</button>
                   <button onClick={handleAddItem} className="flex-1 py-4 bg-orange-500 text-black rounded-2xl font-black text-xs uppercase hover:bg-orange-400">
                     {(newItemData.producerId && activeProducerId && activeProducerId !== 'unassigned') ? 'Vincular Produto' : 'Salvar Item'}
                   </button>
                </div>
             </motion.div>
          </div>
        )}

        {prepModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setPrepModal(null)} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#141414] border border-[#222] p-8 rounded-[2.5rem] max-w-lg w-full relative z-10 space-y-6">
               <h3 className="text-2xl font-black text-white uppercase italic tracking-tight">Preparar Materiais</h3>
               <div className="space-y-4">
                 <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Link do Áudio</label>
                   <input className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-5 py-3 text-white outline-none focus:border-blue-500" value={prepData.audio} onChange={e => setPrepData({...prepData, audio: e.target.value})} />
                 </div>
                 <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Link do Vídeo Base</label>
                   <input className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-5 py-3 text-white outline-none focus:border-blue-500" value={prepData.video} onChange={e => setPrepData({...prepData, video: e.target.value})} />
                 </div>
                 <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Anotações extras</label>
                   <textarea className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-5 py-3 text-white outline-none focus:border-blue-500 h-24" value={prepData.notes} onChange={e => setPrepData({...prepData, notes: e.target.value})} />
                 </div>
               </div>
               <div className="flex gap-3 pt-4">
                 <button onClick={() => setPrepModal(null)} className="flex-1 py-4 bg-[#1a1a1a] text-gray-500 rounded-2xl font-black text-xs uppercase hover:text-white">Cancelar</button>
                 <button onClick={handleSavePrep} className="flex-1 py-4 bg-blue-500 text-black rounded-2xl font-black text-xs uppercase hover:bg-blue-400">Salvar Material</button>
               </div>
            </motion.div>
          </div>
        )}

        {completionModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setCompletionModal(null)} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#141414] border border-[#222] p-8 rounded-[2.5rem] max-w-lg w-full relative z-10 space-y-6">
                <h3 className="text-2xl font-black text-white uppercase italic tracking-tight">Vídeo Pronto</h3>
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Link do Vídeo Finalizado</label>
                    <input className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-5 py-3 text-white outline-none focus:border-orange-500" value={finishedVideoData.url} onChange={e => setFinishedVideoData({...finishedVideoData, url: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Para qual conta é este vídeo?</label>
                    <div className="grid grid-cols-1 gap-2">
                      {pendingProduction
                        .filter(s => s.producerId === completionModal.producerId && s.productId === completionModal.productId && s.status === ScheduleStatus.PLANNED)
                        .map(item => {
                          const acc = accounts.find(a => a.id === item.accountId);
                          return (
                            <button 
                              key={item.id}
                              onClick={() => setFinishedVideoData({...finishedVideoData, accountId: item.accountId})}
                              className={`p-4 border-2 rounded-2xl flex items-center justify-between transition-all ${finishedVideoData.accountId === item.accountId ? 'border-orange-500 bg-orange-500/5' : 'border-[#222] bg-[#0a0a0a]'}`}
                            >
                               <span className="text-sm font-bold text-white">{acc?.name}</span>
                               <span className="text-[9px] uppercase font-black text-gray-500">{acc?.platform}</span>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button onClick={() => setCompletionModal(null)} className="flex-1 py-4 bg-[#1a1a1a] text-gray-500 rounded-2xl font-black text-xs uppercase hover:text-white">Cancelar</button>
                  <button onClick={handleCompleteVideo} className="flex-1 py-4 bg-orange-500 text-black rounded-2xl font-black text-xs uppercase hover:bg-orange-400">Finalizar e Atribuir</button>
                </div>
             </motion.div>
          </div>
        )}

        {activePreviewVideo && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }} 
               exit={{ opacity: 0 }} 
               className="absolute inset-0 bg-black/90 backdrop-blur-md" 
               onClick={() => setActivePreviewVideo(null)} 
             />
             <motion.div 
               initial={{ scale: 0.9, opacity: 0 }} 
               animate={{ scale: 1, opacity: 1 }} 
               exit={{ scale: 0.9, opacity: 0 }} 
               className="bg-[#0f0f0f] border border-[#222] p-6 rounded-[2.5rem] max-w-2xl w-full relative z-10 space-y-4 shadow-2xl flex flex-col max-h-[90vh]"
             >
                <div className="flex items-center justify-between pb-2 border-b border-[#222]">
                  <h3 className="text-lg font-black text-white hover:text-orange-500 uppercase italic tracking-tight truncate max-w-[80%]">
                    {activePreviewVideo.name}
                  </h3>
                  <button 
                    onClick={() => setActivePreviewVideo(null)} 
                    className="p-2 bg-[#1a1a1a] text-gray-400 hover:text-white rounded-full transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 bg-black rounded-2xl border border-[#222] overflow-hidden relative min-h-[300px] md:min-h-[450px] flex items-center justify-center">
                  {(() => {
                    const url = activePreviewVideo.url;
                    const driveIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
                    if (driveIdMatch && driveIdMatch[1]) {
                      const embedUrl = `https://drive.google.com/file/d/${driveIdMatch[1]}/preview`;
                      return (
                        <iframe 
                          src={embedUrl} 
                          className="w-full h-full absolute inset-0 rounded-2xl" 
                          allow="autoplay" 
                          allowFullScreen
                        />
                      );
                    }
                    if (url.includes('drive.google.com')) {
                      const embedUrl = url.replace('/view', '/preview').replace('/edit', '/preview');
                      return (
                        <iframe 
                          src={embedUrl}
                          className="w-full h-full absolute inset-0 rounded-2xl"
                          allow="autoplay"
                          allowFullScreen
                        />
                      );
                    }
                    if (activePreviewVideo.type === 'audio') {
                      return (
                        <audio
                          src={url}
                          controls
                          autoPlay
                          className="w-full max-w-xl"
                          referrerPolicy="no-referrer"
                        />
                      );
                    }
                    return (
                      <video 
                        src={url} 
                        controls 
                        autoPlay 
                        className="w-full h-full object-contain rounded-2xl"
                        referrerPolicy="no-referrer"
                      />
                    );
                  })()}
                </div>

                <div className="flex items-center justify-between gap-4 pt-2">
                  <span className="text-[10px] uppercase font-black tracking-widest text-gray-500">Preview Integrado</span>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-white font-extrabold">{part.slice(2, -2)}</strong>;
    }
    const italicParts = part.split(/(\*.*?\*)/g);
    return italicParts.map((subPart, j) => {
      if (subPart.startsWith('*') && subPart.endsWith('*')) {
        return <em key={j} className="text-gray-300 italic">{subPart.slice(1, -1)}</em>;
      }
      return subPart;
    });
  });
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-2 text-gray-200 text-sm leading-relaxed font-sans">
      {lines.map((line, idx) => {
        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
          const cleaned = line.trim().replace(/^[-*]\s+/, '');
          return (
            <div key={idx} className="flex gap-2 items-start pl-2">
              <span className="text-blue-400 select-none mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500" />
              <div className="flex-1">{formatInlineMarkdown(cleaned)}</div>
            </div>
          );
        }
        
        const numListMatch = line.trim().match(/^(\d+)\.\s+(.*)/);
        if (numListMatch) {
          return (
            <div key={idx} className="flex gap-2 items-start pl-2">
              <span className="text-blue-400 select-none font-bold text-xs shrink-0">{numListMatch[1]}.</span>
              <div className="flex-1">{formatInlineMarkdown(numListMatch[2])}</div>
            </div>
          );
        }

        if (line.startsWith('### ')) {
          return <h5 key={idx} className="text-sm font-black uppercase text-blue-400 mt-4 tracking-wider">{formatInlineMarkdown(line.slice(4))}</h5>;
        }
        if (line.startsWith('## ')) {
          return <h4 key={idx} className="text-base font-black text-white mt-4 italic tracking-tight">{formatInlineMarkdown(line.slice(3))}</h4>;
        }
        if (line.startsWith('# ')) {
          return <h3 key={idx} className="text-lg font-black text-white mt-4 italic tracking-tight">{formatInlineMarkdown(line.slice(2))}</h3>;
        }

        return <p key={idx} className="min-h-[1rem]">{formatInlineMarkdown(line)}</p>;
      })}
    </div>
  );
}

function normalizeTiktokUrl(url: string): string {
  if (!url) return '';
  try {
    let clean = url.trim().toLowerCase();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    const u = new URL(clean);
    u.search = '';
    return u.toString().replace(/\/$/, '');
  } catch (e) {
    return url.trim().toLowerCase().replace(/\/$/, '');
  }
}

function extractTiktokUsername(url: string): string | null {
  if (!url) return null;
  const match = url.match(/@([a-zA-Z0-9_\.]+)/);
  if (match) return '@' + match[1];
  return null;
}

function normalizeCreatorHandle(handle?: string | null): string {
  const clean = (handle || '').trim();
  if (!clean) return '';
  return clean.startsWith('@') ? clean : `@${clean}`;
}

function getTimestampValue(value: any): number {
  if (!value) return 0;
  if (typeof value.seconds === 'number') return value.seconds;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed / 1000;
}

function isOperationalCreatorHandle(handle: string, accounts: Account[]): boolean {
  const clean = normalizeCreatorHandle(handle).replace('@', '').toLowerCase();
  if (!clean) return false;
  if (/^socialcommerce\d+$/.test(clean)) return true;

  return accounts.some(acc => {
    const accountHandle = (acc.handle || '').replace('@', '').toLowerCase();
    const accountName = (acc.name || '').replace('@', '').toLowerCase();
    return clean === accountHandle || clean === accountName;
  });
}

function resolveCreatorHandle(
  scheduleItem: ScheduleItem | undefined,
  linkedTikTokLink: TiktokLink | undefined,
  accounts: Account[],
  manualFallback = ''
): string {
  const candidates = [
    scheduleItem?.creatorHandle,
    linkedTikTokLink?.creatorHandle,
    extractTiktokUsername(linkedTikTokLink?.link || ''),
    manualFallback
  ];

  for (const candidate of candidates) {
    const clean = normalizeCreatorHandle(candidate || '');
    if (clean && !isOperationalCreatorHandle(clean, accounts)) return clean;
  }

  return '';
}

function findLatestAvailableSupplierLink(tiktokLinks: TiktokLink[], userId: string, supplierId?: string): TiktokLink | undefined {
  return [...tiktokLinks]
    .filter(lnk => {
      if (lnk.scheduleItemId) return false;
      if (supplierId && lnk.supplierId === supplierId) return true;
      return lnk.userId === userId;
    })
    .sort((a, b) => {
      const tA = getTimestampValue(a.createdAt);
      const tB = getTimestampValue(b.createdAt);
      if (tA !== tB) return tB - tA;
      return b.id.localeCompare(a.id);
    })[0];
}

function findPendingSupplierLink(tiktokLinks: TiktokLink[], pendingLinkId: string | null, supplierId?: string): TiktokLink | undefined {
  if (!pendingLinkId) return undefined;
  return tiktokLinks.find(lnk =>
    lnk.id === pendingLinkId &&
    !lnk.scheduleItemId &&
    !(lnk as any).consumedAt &&
    (!supplierId || lnk.supplierId === supplierId)
  );
}

function compactCodePart(value?: string | null, fallback = 'ITEM'): string {
  const normalized = (value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toUpperCase();

  return (normalized || fallback).slice(0, 12);
}

function buildProductionCode(
  item: Pick<ScheduleItem, 'date' | 'accountId' | 'productId' | 'dailyIndex'>,
  accounts: Account[],
  products: Product[],
  schedule: ScheduleItem[]
): string {
  const account = accounts.find(acc => acc.id === item.accountId);
  const product = products.find(prod => prod.id === item.productId);
  const accountPart = compactCodePart(account?.handle || account?.name, item.accountId ? 'ACC' : 'SEMCONTA');
  const productPart = compactCodePart(product?.name, item.productId ? 'PROD' : 'SEMPROD');
  const datePart = (item.date || getLocalDateString()).replace(/-/g, '');

  let index = item.dailyIndex || 0;
  if (!index) {
    const sameGroup = schedule.filter(s =>
      s.date === item.date &&
      s.accountId === item.accountId &&
      s.productId === item.productId
    );
    const maxIndex = sameGroup.reduce((max, s) => Math.max(max, s.dailyIndex || 0), 0);
    index = maxIndex + 1;
  }

  return `${accountPart}-${productPart}-${datePart}-${String(index).padStart(3, '0')}`;
}

function sanitizeStoragePathPart(value?: string | null): string {
  return (value || 'item')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'item';
}

async function readJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  throw new Error(`Resposta inesperada do servidor (Status ${response.status}). ${text.substring(0, 160)}`);
}

async function uploadProductionAsset(params: {
  file: File;
  folderName: string;
  finalName: string;
  userId: string;
  scope: string;
  kind: 'audio' | 'video' | 'finished';
}) {
  const { file, folderName, finalName, userId, scope, kind } = params;

  try {
    const folderRes = await fetch('/api/drive/folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: folderName })
    });
    const folderData = await readJsonResponse(folderRes);
    if (!folderRes.ok) throw new Error(folderData.error || "Google Drive nao configurado.");

    const formData = new FormData();
    formData.append('file', file);
    formData.append('parentId', folderData.id);
    formData.append('fileName', finalName);

    const uploadResponse = await fetch('/api/drive/upload', {
      method: 'POST',
      body: formData
    });
    const driveFile = await readJsonResponse(uploadResponse);
    if (!uploadResponse.ok) throw new Error(driveFile.error || "Erro no upload do servidor.");

    return {
      url: driveFile.webViewLink,
      name: driveFile.name || finalName,
      provider: 'google_drive'
    };
  } catch (driveError: any) {
    console.warn('[Upload] Google Drive falhou. Tentando Firebase Storage.', driveError);

    const storagePath = [
      'production_uploads',
      sanitizeStoragePathPart(scope),
      sanitizeStoragePathPart(userId),
      sanitizeStoragePathPart(kind),
      sanitizeStoragePathPart(folderName),
      `${Date.now()}_${sanitizeStoragePathPart(finalName)}`
    ].join('/');

    try {
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, file, { contentType: file.type || 'application/octet-stream' });
      const url = await getDownloadURL(fileRef);
      return {
        url,
        name: finalName,
        provider: 'firebase_storage',
        storagePath
      };
    } catch (storageError: any) {
      console.error('[Upload] Firebase Storage tambem falhou.', storageError);
      const driveMessage = driveError?.message ? `Drive: ${driveError.message}` : 'Drive indisponivel.';
      const storageMessage = storageError?.message ? `Storage: ${storageError.message}` : 'Storage indisponivel.';
      throw new Error(`Nao foi possivel enviar o arquivo. ${driveMessage} ${storageMessage}`);
    }
  }
}

function TiktokVideoIdentifier({ tiktokLinks, user, viewMode, linkedProducer, pendingLinkId, onPendingLinkAccepted }: { tiktokLinks: TiktokLink[], user: FirebaseUser, viewMode: ViewMode, linkedProducer?: Producer, pendingLinkId?: string | null, onPendingLinkAccepted?: (link: TiktokLink) => void }) {
  const [tiktokInput, setTiktokInput] = useState('');
  const pendingLink = findPendingSupplierLink(tiktokLinks, pendingLinkId || null, linkedProducer?.id);

  return (
    <div className="bg-[#121212] border border-[#222] p-6 rounded-[2rem] space-y-5">
      <div className="space-y-1">
        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Identificador de Video TikTok
        </h4>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Insira o link do video do TikTok abaixo para verificar o status e salvar seu identificador de duplicidade.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">Link do Video TikTok</label>
          <input
            type="url"
            value={tiktokInput}
            onChange={(e) => setTiktokInput(e.target.value)}
            placeholder="https://www.tiktok.com/@usuario/video/..."
            className="w-full bg-[#0a0a0a] text-white border border-[#222] focus:border-red-500/50 outline-none px-4 py-3 rounded-xl text-xs placeholder-gray-600 font-mono transition-all"
          />
        </div>

        {tiktokInput.trim() !== '' && (() => {
          const normalizedInput = normalizeTiktokUrl(tiktokInput);
          const matchingLink = tiktokLinks.find(item => normalizeTiktokUrl(item.link) === normalizedInput);
          const exists = !!matchingLink;

          if (exists) {
            return (
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex flex-col gap-1 animate-fadeIn">
                <p className="text-xs text-red-400 font-bold flex items-center gap-1.5 uppercase tracking-wide">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  Ja Carregado!
                </p>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Este video ja foi carregado por nossa equipe anteriormente. Por favor, utilize outro material para evitar duplicidade.
                </p>
                {matchingLink.createdAt && (
                  <p className="text-[9px] text-gray-600 font-mono mt-1 uppercase tracking-wider">
                    Registrado em: {new Date(matchingLink.createdAt?.seconds ? (matchingLink.createdAt.seconds * 1000) : matchingLink.createdAt).toLocaleDateString('pt-BR')} as {new Date(matchingLink.createdAt?.seconds ? (matchingLink.createdAt.seconds * 1000) : matchingLink.createdAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}
                  </p>
                )}
              </div>
            );
          }

          return (
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl flex flex-col gap-2 animate-fadeIn">
              <p className="text-xs text-emerald-400 font-bold flex items-center gap-1.5 uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Link Livre (Nao Carregado)
              </p>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Este identificador de video TikTok esta livre e limpo no sistema! Deseja registrar agora?
              </p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const handleValue = extractTiktokUsername(tiktokInput.trim()) || "@criador_tiktok";
                    const docRef = await addDoc(collection(db, 'tiktok_links'), {
                      link: tiktokInput.trim(),
                      creatorHandle: handleValue,
                      scope: viewMode === ViewMode.COMPANY ? 'COMPANY' : 'PERSONAL',
                      userId: user.uid,
                      supplierId: linkedProducer?.id || null,
                      pendingForSupplierId: linkedProducer?.id || null,
                      pendingAt: new Date().toISOString(),
                      createdAt: serverTimestamp() || new Date().toISOString()
                    });
                    onPendingLinkAccepted?.({
                      id: docRef.id,
                      link: tiktokInput.trim(),
                      creatorHandle: handleValue,
                      scope: viewMode === ViewMode.COMPANY ? 'COMPANY' : 'PERSONAL',
                      userId: user.uid,
                      supplierId: linkedProducer?.id || undefined,
                      createdAt: new Date().toISOString()
                    });
                    setTiktokInput('');
                    alert('Link registrado no banco de dados com sucesso!');
                  } catch (err: any) {
                    alert('Erro ao salvar link no banco: ' + err.message);
                  }
                }}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Armazenar Link
              </button>
            </div>
          );
        })()}
      </div>

      {pendingLink && (
        <div className="bg-blue-500/10 border border-blue-500/20 text-blue-300 p-3.5 rounded-2xl text-xs leading-relaxed">
          Link validado e pronto para o proximo upload: <strong>{pendingLink.creatorHandle || extractTiktokUsername(pendingLink.link) || pendingLink.link}</strong>
        </div>
      )}

    </div>
  );
}

function Planner({ schedule, accounts, products, user, viewMode, producers, tiktokLinks = [] }: { schedule: ScheduleItem[], accounts: Account[], products: Product[], user: FirebaseUser, viewMode: ViewMode, producers: Producer[], tiktokLinks?: TiktokLink[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ date: getLocalDateString(), accountId: '', productId: '', producerId: '', supplierId: '', status: ScheduleStatus.PLANNED });
  const [postCount, setPostCount] = useState(1);
  const [distributionType, setDistributionType] = useState<'same' | 'different'>('same');
  const [assignments, setAssignments] = useState<{ productId: string, count: number }[]>([]);
  const [statusModal, setStatusModal] = useState<{ id: string, targetStatus: ScheduleStatus } | null>(null);
  const [videoLink, setVideoLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productPickerSearch, setProductPickerSearch] = useState('');

  const linkedProducer = producers.find(p => isProducerLinkedToUser(p, user));
  const userRole = getProducerLinkedRole(linkedProducer);

  // Supplier UI state
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [supplierTab, setSupplierTab] = useState<'materials' | 'chat'>(userRole === 'supplier' ? 'chat' : 'materials');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'model', text: string }>>([
    {
      role: 'model',
      text: 'Olá! Sou o Assistente Gemini do seu Painel de Fornecedor. 🎬\n\nEstou aqui para acelerar a preparação de seus materiais de apoio. Posso te ajudar a:\n- Gerar **hooks/ganchos irresistíveis** de retenção para os produtos de hoje.\n- Redigir **notas de produção/observações completas** para poupar seu tempo (você pode copiá-las e colá-las direto nos lotes!).\n- Dar ideias para trilhas sonoras, ritmos de áudio ou referências visuais.\n- Escrever **legendas persuasivas** e hashtags em alta para as postagens.\n\nComo posso ajudar você a produzir melhor hoje?'
    }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [preparingItemId, setPreparingItemId] = useState<string | null>(null);
  const [slotInputs, setSlotInputs] = useState<Record<string, { audioUrl: string, videoUrl: string, notes: string }>>({});
  const [activeSupplierPreview, setActiveSupplierPreview] = useState<{ url: string; name: string; type: 'audio' | 'video' } | null>(null);
  const sessionAssignmentsRef = useRef<Record<string, string>>({});

  const [uploadingItem, setUploadingItem] = useState<{ id: string, type: 'audio' | 'video' } | null>(null);
  const activeSuppliers = useMemo(() => {
    return producers.filter(p => !p.hidden && (p.role === 'supplier' || getProducerLinkedRole(p) === 'supplier'));
  }, [producers]);
  const activeEditors = useMemo(() => {
    return producers.filter(p => !p.hidden && (p.role === 'editor' || getProducerLinkedRole(p) === 'editor'));
  }, [producers]);

  const handleSendSupplierChat = async (customMessage?: string) => {
    const messageToSend = (customMessage || chatInput).trim();
    if (!messageToSend || chatLoading) return;

    if (!customMessage) setChatInput('');

    const userMessage = { role: 'user' as const, text: messageToSend };
    setChatMessages(prev => [...prev, userMessage]);
    setChatLoading(true);

    try {
      const activeProductsForContext = supplierGroupedProducts.map(group => ({
        name: group.product.name,
        category: group.product.category
      }));

      const res = await fetch('/api/supplier/gemini-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: messageToSend,
          history: chatMessages,
          selectedDate,
          contextProducts: activeProductsForContext
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro de comunicação com o servidor do Gemini.');
      }

      setChatMessages(prev => [...prev, { role: 'model', text: data.text }]);
    } catch (err: any) {
      console.error("[Supplier Chat ERROR]", err);
      setChatMessages(prev => [...prev, { 
        role: 'model', 
        text: `⚠️ **Erro ao consultar o assistente:** ${err.message || 'Houve um problema de rede ou chave inválida.'}\n\n*Dica: Certifique-se de preencher a chave GEMINI_API_KEY no menu de Secrets nas configurações do AI Studio (ícone de engrenagem).*` 
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const getPlannerUploadBlockMessages = (item: ScheduleItem, type: 'audio' | 'video') => {
    const inputs = slotInputs[item.id] || { audioUrl: '', videoUrl: '', notes: '' };
    const hasContentLink = type === 'audio' ? !!inputs.audioUrl.trim() : !!inputs.videoUrl.trim();
    return getSupplierUploadBlockMessages(hasContentLink, !!item.producerId);
  };

  const getPlannerSendBlockMessages = (item: ScheduleItem) => {
    const inputs = slotInputs[item.id] || { audioUrl: '', videoUrl: '', notes: '' };
    const hasTypedLink = !!inputs.audioUrl.trim() || !!inputs.videoUrl.trim();
    const hasMaterial = normalizeFileList(item.audioMaterial).length > 0 || normalizeFileList(item.videoMaterial).length > 0;
    return getSupplierUploadBlockMessages(hasTypedLink || hasMaterial, true);
  };

  const handleUploadFile = async (itemId: string, type: 'audio' | 'video', file: File) => {
    try {
      const item = schedule.find(s => s.id === itemId);
      if (!item) return;

      const blockMessages = getPlannerUploadBlockMessages(item, type);
      if (blockMessages.length > 0) {
        alert(blockMessages.join('\n'));
        return;
      }

      setUploadingItem({ id: itemId, type });

      const productItems = schedule
        .filter(s => s.date === item.date && s.productId === item.productId)
        .sort((a, b) => a.id.localeCompare(b.id));
      const productIdx = productItems.findIndex(s => s.id === item.id);
      const dIndex = productIdx !== -1 ? productIdx + 1 : 1;

      if (item.dailyIndex !== dIndex) {
        await updateDoc(doc(db, 'schedule', itemId), { dailyIndex: dIndex });
      }

      const product = products.find(p => p.id === item.productId);
      const folderName = product ? `Influency_${product.name}` : 'Influency_Assets';
      
      const folderRes = await fetch('/api/drive/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderName })
      });
      
      let folderData;
      const folderContentType = folderRes.headers.get("content-type");
      if (folderContentType && folderContentType.includes("application/json")) {
        folderData = await folderRes.json();
      } else {
        const text = await folderRes.text();
        throw new Error(`Erro no servidor (Status ${folderRes.status}). ${text.substring(0, 100)}`);
      }
      
      if (!folderRes.ok) {
        throw new Error(folderData.error || "Google Drive não configurado.");
      }
      const folderId = folderData.id;

      const paddedIndex = String(dIndex).padStart(3, '0');
      const extension = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '';
      const baseFileName = paddedIndex;
      const finalName = baseFileName + extension;
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('parentId', folderId);
      formData.append('fileName', finalName);

      const uploadResponse = await fetch('/api/drive/upload', {
        method: 'POST',
        body: formData
      });

      let driveFile;
      const uploadContentType = uploadResponse.headers.get("content-type");
      if (uploadContentType && uploadContentType.includes("application/json")) {
        driveFile = await uploadResponse.json();
      } else {
        const text = await uploadResponse.text();
        throw new Error(`Erro no upload (Status ${uploadResponse.status}). ${text.substring(0, 100)}`);
      }

      if (!uploadResponse.ok) {
        throw new Error(driveFile.error || "Erro no upload do servidor.");
      }
      const url = driveFile.webViewLink;
      const savedName = driveFile.name || finalName;
      
      const field = type === 'audio' ? 'audioMaterial' : 'videoMaterial';
      const updates: any = { [field]: arrayUnion({ url, name: savedName }) };
      
      updates.materialAddedAt = new Date().toISOString();
      if (!item.productionCode) {
        updates.productionCode = buildProductionCode(item, accounts, products, schedule);
      }

      await updateDoc(doc(db, 'schedule', itemId), updates);
    } catch (err: any) {
      console.error('Upload error:', err);
      alert(`Erro no upload: ${err.message}`);
    } finally {
      setUploadingItem(null);
    }
  };

  const handleDeleteMaterial = async (itemId: string, type: 'audio' | 'video', index: number) => {
    try {
      const item = schedule.find(s => s.id === itemId);
      if (!item) return;

      const field = type === 'audio' ? 'audioMaterial' : 'videoMaterial';
      const currentList = Array.isArray(item[field]) ? [...item[field] as any[]] : [];
      currentList.splice(index, 1);

      await updateDoc(doc(db, 'schedule', itemId), {
        [field]: currentList
      });
    } catch (err: any) {
      alert(`Erro ao excluir material: ${err.message}`);
    }
  };

  const handleSlotInputChange = (itemId: string, field: 'audioUrl' | 'videoUrl' | 'notes', value: string) => {
    setSlotInputs(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || { audioUrl: '', videoUrl: '', notes: '' }),
        [field]: value
      }
    }));
  };

  const supplierGroupedProducts = useMemo(() => {
    if (userRole !== 'supplier' || !linkedProducer) return [];
    
    const dateItems = schedule.filter(s => s.date === selectedDate);
    const groups: Record<string, {
      product: Product;
      items: ScheduleItem[];
    }> = {};

    dateItems.forEach(item => {
      const prod = products.find(p => p.id === item.productId);
      if (!prod) return;

      const isMyTask = isScheduleAssignedToSupplier(item, linkedProducer.id);
      if (!isMyTask) return;

      if (!groups[item.productId]) {
        groups[item.productId] = {
          product: prod,
          items: []
        };
      }
      groups[item.productId].items.push(item);
    });

    return Object.values(groups).sort((a, b) => (a.product?.name || '').localeCompare(b.product?.name || ''));
  }, [schedule, selectedDate, userRole, linkedProducer, products]);

  const handleSendToEditing = async (item: ScheduleItem, indexOnDay: number) => {
    if (!linkedProducer) return;
    try {
      const dateParts = item.date.split('-');
      const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}` : item.date;
      const computedCode = `${String(indexOnDay + 1).padStart(3, '0')}-${formattedDate}`; // "001-20/05"
      
      const inputs = slotInputs[item.id] || { audioUrl: '', videoUrl: '', notes: '' };
      const blockMessages = getPlannerSendBlockMessages(item);
      if (blockMessages.length > 0) {
        alert(blockMessages.join('\n'));
        return;
      }
      
      const updates: any = {
        supplierId: linkedProducer.id,
        status: ScheduleStatus.EDITING,
        videoCode: computedCode,
        productionCode: item.productionCode || buildProductionCode(item, accounts, products, schedule),
        materialAddedAt: new Date().toISOString()
      };

      // Automatically assign an editor (producerId) if not already set
      let assignedEditorId = item.producerId;
      if (!assignedEditorId) {
        // Get editors that are explicitly linked to this product (via linkedProductIds)
        const productEditors = activeEditors.filter(p => Array.isArray(p.linkedProductIds) && p.linkedProductIds.includes(item.productId));

        if (activeEditors.length > 0) {
          // Pool de candidatos: prioriza editores vinculados ao produto, senão usa todos ativos.
          const candidatePool = productEditors.length > 0 ? productEditors : activeEditors;

          // Ordenação estável para garantir consistência no round-robin
          const sortedPool = [...candidatePool].sort((a, b) => a.id.localeCompare(b.id));

          // Calcula a carga de trabalho de cada editor (não postados e que estão ativamente em fase de edição)
          // Considera atribuições feitas na sessão corrente (antes de sincronizar no Firestore) para evitar condições de corrida (race conditions)
          const getLoad = (editorId: string) => {
            const scheduleLoad = schedule.filter(s => s.producerId === editorId && s.status === ScheduleStatus.EDITING).length;
            
            let sessionCount = 0;
            Object.entries(sessionAssignmentsRef.current).forEach(([id, assignedId]) => {
              if (assignedId === editorId) {
                const alreadySynced = schedule.some(s => s.id === id && s.producerId === editorId && s.status === ScheduleStatus.EDITING);
                if (!alreadySynced) {
                  sessionCount++;
                }
              }
            });

            return scheduleLoad + sessionCount;
          };

          const workloads = sortedPool.map(e => ({ editor: e, load: getLoad(e.id) }));

          // Encontra a menor carga de trabalho
          const minLoad = Math.min(...workloads.map(w => w.load));
          
          // Candidatos de menor carga (sem material ou com menos materiais)
          const bestCandidates = workloads.filter(w => w.load === minLoad).map(w => w.editor);

          // Usa o indexOnDay de forma determinística para distribuir o material
          const selectIndex = indexOnDay % bestCandidates.length;
          assignedEditorId = bestCandidates[selectIndex].id;

          // Grava no cache de sessão para os próximos cliques ultra rápidos
          sessionAssignmentsRef.current[item.id] = assignedEditorId;
        }
      }

      if (assignedEditorId) {
        updates.producerId = assignedEditorId;
      }

      if (inputs.audioUrl.trim()) {
        updates.audioMaterial = arrayUnion({ url: inputs.audioUrl.trim(), name: 'Link Manual' });
      }
      if (inputs.videoUrl.trim()) {
        updates.videoMaterial = arrayUnion({ url: inputs.videoUrl.trim(), name: 'Link Manual' });
      }
      if (inputs.notes.trim()) {
        updates.productionNotes = inputs.notes.trim();
      } else if (!item.productionNotes) {
        updates.productionNotes = 'Material fornecido.';
      }

      await updateDoc(doc(db, 'schedule', item.id), updates);
      
      setSlotInputs(prev => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
    } catch (err: any) {
      alert('Erro ao enviar material: ' + err.message);
    }
  };

  const videoDisplayNames = useMemo(() => {
    const counts: Record<string, number> = {};
    const result: Record<string, string> = {};
    const sorted = [...schedule].sort((a, b) => a.date.localeCompare(b.date));

    sorted.forEach(v => {
      const key = `${v.accountId}_${v.date}`;
      counts[key] = (counts[key] || 0) + 1;
      result[v.id] = counts[key].toString();
    });

    return result;
  }, [schedule]);

  // Handle local File Pickers
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadContext, setUploadContext] = useState<{ id: string, type: 'audio' | 'video' } | null>(null);

  const triggerLocalUpload = (itemId: string, type: 'audio' | 'video') => {
    const item = schedule.find(s => s.id === itemId);
    if (item) {
      const blockMessages = getPlannerUploadBlockMessages(item, type);
      if (blockMessages.length > 0) {
        alert(blockMessages.join('\n'));
        return;
      }
    }
    setUploadContext({ id: itemId, type });
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 50);
  };

  // If supplier role, return the custom materials preparation panel view immediately
  if (userRole === 'supplier') {
    return (
      <div className="space-y-8">
        {/* Unified Premium Header with Tab Switcher */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-[#141414]/40 p-6 rounded-[2rem] border border-[#222]">
          <div className="space-y-1">
            <h3 className="text-2xl font-black text-white italic uppercase tracking-tight flex items-center gap-2">
              {supplierTab === 'materials' ? '📋 Preparar Materiais' : '✨ Chat com Gemini'}
            </h3>
            <p className="text-sm text-gray-400">
              {supplierTab === 'materials' 
                ? 'Suba áudio base, material bruto de vídeo e escreva notas de acompanhamento para os editores.'
                : 'Seu copiloto de IA para gerar ganchos de vídeo, estruturar notas de edição, roteiros e hashtags.'}
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            {/* Elegant Selector Group */}
            <div className="flex bg-[#0d0d0d] border border-[#222] p-1 rounded-2xl">
              <button
                onClick={() => setSupplierTab('materials')}
                className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                  supplierTab === 'materials' 
                    ? 'bg-[#1a1a1a] text-blue-400 border border-blue-500/15 shadow-md' 
                    : 'text-gray-500 hover:text-gray-300 border border-transparent'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                Materiais
              </button>
              <button
                onClick={() => setSupplierTab('chat')}
                className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                  supplierTab === 'chat' 
                    ? 'bg-[#1a1a1a] text-blue-400 border border-blue-500/15 shadow-md' 
                    : 'text-gray-500 hover:text-gray-300 border border-transparent'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Assistente Gemini
              </button>
            </div>

            {/* Date Selector only visible for Materials */}
            {supplierTab === 'materials' && (
              <div className="flex items-center gap-2 bg-[#141414] border border-[#222] p-1.5 rounded-2xl shrink-0">
                <button 
                  onClick={() => {
                    setSelectedDate(addDaysToLocalDateString(selectedDate, -1));
                  }}
                  className="p-2 hover:bg-[#1a1a1a] text-gray-400 hover:text-white rounded-xl transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <input 
                  type="date" 
                  className="bg-transparent text-white font-bold outline-none border-none text-sm px-2 cursor-pointer" 
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                />
                <button 
                  onClick={() => {
                    setSelectedDate(addDaysToLocalDateString(selectedDate, 1));
                  }}
                  className="p-2 hover:bg-[#1a1a1a] text-gray-400 hover:text-white rounded-xl transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setSelectedDate(getLocalDateString())}
                  className="text-xs font-black uppercase text-orange-500 hover:text-orange-400 px-3 py-2 hover:bg-orange-500/5 rounded-xl transition-all"
                >
                  Hoje
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Hidden inputs specifically for Planner file uploads */}
        <input 
          type="file" 
          className="hidden" 
          ref={fileInputRef}
          accept={uploadContext?.type === 'audio' ? "audio/*" : "video/*"}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && uploadContext && handleUploadFile) {
              handleUploadFile(uploadContext.id, uploadContext.type, file);
            }
            e.target.value = '';
          }}
        />

        {supplierTab === 'materials' ? (
          <>
            {/* Products Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {supplierGroupedProducts.map(({ product, items }) => {
                const sortedItems = [...items].sort((a, b) => a.id.localeCompare(b.id));

                return (
                  <div 
                    key={product.id} 
                    className="bg-[#141414] border border-[#222] rounded-[2.5rem] p-8 hover:border-blue-500/10 transition-all space-y-6 flex flex-col justify-between animate-fadeIn"
                  >
                    <div className="space-y-6">
                      {/* Card Header */}
                      <div className="flex items-center gap-4 border-b border-[#222] pb-6">
                        <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20 overflow-hidden shrink-0">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <Folder className="w-8 h-8 text-blue-500" />
                          )}
                        </div>
                        <div>
                          <h4 className="text-white font-black text-xl italic">{product.name}</h4>
                          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">{product.category || 'Categoria Geral'}</p>
                        </div>
                      </div>

                      {/* Slots Section */}
                      <div className="space-y-6">
                        <p className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Lotes Planejados para {selectedDate.split('-').reverse().slice(0, 2).join('/')}</p>
                        
                        <div className="space-y-4">
                          {sortedItems.map((item, idx) => {
                            const countCode = `${String(idx + 1).padStart(3, '0')}`;
                            const isPlanned = item.status === ScheduleStatus.PLANNED;
                            const inputs = slotInputs[item.id] || { audioUrl: '', videoUrl: '', notes: '' };
                            const isCurrentlyUploading = uploadingItem?.id === item.id;
                            const audioUploadBlockMessages = getPlannerUploadBlockMessages(item, 'audio');
                            const videoUploadBlockMessages = getPlannerUploadBlockMessages(item, 'video');
                            const sendBlockMessages = getPlannerSendBlockMessages(item);
                            
                            return (
                              <div key={item.id} className="bg-[#0c0c0c] border border-[#222] rounded-3xl p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-black text-white italic">Fração #{countCode}</span>
                                  
                                  {isPlanned ? (
                                    <span className="text-[10px] font-black uppercase tracking-widest bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-3 py-1 rounded-full">
                                      Pendente
                                    </span>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-mono font-black text-orange-500 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-lg">
                                        {item.productionCode || item.videoCode || `${countCode}-${selectedDate.split('-').slice(1).reverse().join('/')}`}
                                      </span>
                                      <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${
                                        item.status === ScheduleStatus.EDITING ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                                        item.status === ScheduleStatus.PRODUCED ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                                        'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                      }`}>
                                        {item.status === ScheduleStatus.EDITING ? 'Edição' : item.status === ScheduleStatus.PRODUCED ? 'Pronto' : 'Postado'}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* If Planned, show form */}
                                {isPlanned ? (
                                  <div className="space-y-4 pt-2 border-t border-[#1a1a1a]">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block">Link do Áudio Base</label>
                                        <input 
                                          type="text"
                                          placeholder="https://..."
                                          className="w-full bg-[#121212] border border-[#222] rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500"
                                          value={inputs.audioUrl}
                                          onChange={e => handleSlotInputChange(item.id, 'audioUrl', e.target.value)}
                                        />
                                        <button
                                          onClick={() => triggerLocalUpload(item.id, 'audio')}
                                          disabled={audioUploadBlockMessages.length > 0 || (isCurrentlyUploading && uploadingItem?.type === 'audio')}
                                          title={audioUploadBlockMessages.join(' | ')}
                                          className="w-full py-2 bg-[#1a1a1a] border border-[#222] text-gray-400 hover:text-white text-[10px] font-black uppercase rounded-xl transition-all flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                          <Upload className="w-3 h-3" /> 
                                          {isCurrentlyUploading && uploadingItem?.type === 'audio' ? 'Enviando...' : 'Fazer Upload de Áudio'}
                                        </button>
                                        {audioUploadBlockMessages.length > 0 && (
                                          <div className="text-[10px] font-bold text-yellow-400/90 leading-relaxed">
                                            {audioUploadBlockMessages.map(message => <div key={message}>{message}</div>)}
                                          </div>
                                        )}
                                        {/* Uploaded Audio Files in real-time */}
                                        {Array.isArray(item.audioMaterial) && item.audioMaterial.map((m: any, mIdx) => (
                                          <div key={mIdx} className="flex items-center justify-between gap-2 mt-1.5 bg-[#141414] px-3 py-1.5 border border-[#222] rounded-xl">
                                            <span className="text-[10px] text-green-500 font-bold truncate">✅ {typeof m === 'string' ? m : m.name}</span>
                                            <div className="flex items-center gap-1 shrink-0">
                                              <button
                                                type="button"
                                                onClick={() => setActiveSupplierPreview({ url: typeof m === 'string' ? m : m.url, name: typeof m === 'string' ? `Audio #${mIdx + 1}` : (m.name || `Audio #${mIdx + 1}`), type: 'audio' })}
                                                className="text-gray-500 hover:text-blue-400 transition-colors"
                                                title="Reproduzir"
                                              >
                                                <Play className="w-3.5 h-3.5" />
                                              </button>
                                              <button 
                                                type="button"
                                                onClick={() => handleDeleteMaterial(item.id, 'audio', mIdx)}
                                                className="text-gray-500 hover:text-red-500 transition-colors"
                                                title="Remover"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>

                                      <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block">Link do Vídeo Bruto</label>
                                        <input 
                                          type="text"
                                          placeholder="https://..."
                                          className="w-full bg-[#121212] border border-[#222] rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500"
                                          value={inputs.videoUrl}
                                          onChange={e => handleSlotInputChange(item.id, 'videoUrl', e.target.value)}
                                        />
                                        <button
                                          onClick={() => triggerLocalUpload(item.id, 'video')}
                                          disabled={videoUploadBlockMessages.length > 0 || (isCurrentlyUploading && uploadingItem?.type === 'video')}
                                          title={videoUploadBlockMessages.join(' | ')}
                                          className="w-full py-2 bg-[#1a1a1a] border border-[#222] text-gray-400 hover:text-white text-[10px] font-black uppercase rounded-xl transition-all flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                          <Upload className="w-3 h-3" /> 
                                          {isCurrentlyUploading && uploadingItem?.type === 'video' ? 'Enviando...' : 'Fazer Upload de Vídeo'}
                                        </button>
                                        {videoUploadBlockMessages.length > 0 && (
                                          <div className="text-[10px] font-bold text-yellow-400/90 leading-relaxed">
                                            {videoUploadBlockMessages.map(message => <div key={message}>{message}</div>)}
                                          </div>
                                        )}
                                        {/* Uploaded Video Files in real-time */}
                                        {Array.isArray(item.videoMaterial) && item.videoMaterial.map((m: any, mIdx) => (
                                          <div key={mIdx} className="flex items-center justify-between gap-2 mt-1.5 bg-[#141414] px-3 py-1.5 border border-[#222] rounded-xl">
                                            <span className="text-[10px] text-green-500 font-bold truncate">✅ {typeof m === 'string' ? m : m.name}</span>
                                            <div className="flex items-center gap-1 shrink-0">
                                              <button
                                                type="button"
                                                onClick={() => setActiveSupplierPreview({ url: typeof m === 'string' ? m : m.url, name: typeof m === 'string' ? `Video bruto #${mIdx + 1}` : (m.name || `Video bruto #${mIdx + 1}`), type: 'video' })}
                                                className="text-gray-500 hover:text-purple-400 transition-colors"
                                                title="Reproduzir"
                                              >
                                                <Play className="w-3.5 h-3.5" />
                                              </button>
                                              <button 
                                                type="button"
                                                onClick={() => handleDeleteMaterial(item.id, 'video', mIdx)}
                                                className="text-gray-500 hover:text-red-500 transition-colors"
                                                title="Remover"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="space-y-1.5">
                                      <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block">Observações / Orientação de Edição</label>
                                        <button
                                          onClick={() => {
                                            setSupplierTab('chat');
                                            handleSendSupplierChat(`Me ajude a escrever notas de edição profissionais e completas com orientações criativas para o produto **${product.name}**.`);
                                          }}
                                          className="text-[9px] font-black text-blue-400 hover:text-blue-300 uppercase tracking-wider flex items-center gap-1 transition-colors cursor-pointer"
                                        >
                                          <Sparkles className="w-2.5 h-2.5" />
                                          Gerar com Gemini
                                        </button>
                                      </div>
                                      <textarea 
                                        rows={2}
                                        placeholder="Ex: Usar cortes rápidos, música animada..."
                                        className="w-full bg-[#121212] border border-[#222] rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500 resize-none"
                                        value={inputs.notes}
                                        onChange={e => handleSlotInputChange(item.id, 'notes', e.target.value)}
                                      />
                                    </div>

                                    <button 
                                      onClick={() => handleSendToEditing(item, idx)}
                                      disabled={sendBlockMessages.length > 0}
                                      title={sendBlockMessages.join(' | ')}
                                      className="w-full py-3 bg-blue-500 text-white hover:bg-blue-400 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      Finalizar e Enviar p/ Editor
                                    </button>
                                    {sendBlockMessages.length > 0 && (
                                      <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 rounded-2xl p-3 text-[11px] font-bold leading-relaxed">
                                        {sendBlockMessages.map(message => <div key={message}>{message}</div>)}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  // Done view
                                  <div className="space-y-3 pt-3 border-t border-[#1a1a1a] text-xs text-gray-400">
                                    <div className="grid grid-cols-2 gap-4 bg-[#141414] p-3 rounded-2xl border border-[#222]">
                                      <div>
                                        <p className="text-[9px] font-black text-gray-500 uppercase">Áudio Base</p>
                                        {Array.isArray(item.audioMaterial) && item.audioMaterial.length > 0 ? (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const file = item.audioMaterial![0] as any;
                                              setActiveSupplierPreview({ url: typeof file === 'string' ? file : file.url, name: typeof file === 'string' ? 'Audio base' : (file.name || 'Audio base'), type: 'audio' });
                                            }}
                                            className="text-white hover:text-blue-400 font-bold truncate flex items-center gap-1 mt-1 text-left"
                                          >
                                            <Play className="w-3.5 h-3.5 shrink-0" /> Ver audio
                                          </button>
                                        ) : (
                                          <p className="text-gray-600 italic mt-1">Nenhum</p>
                                        )}
                                      </div>
                                      <div>
                                        <p className="text-[9px] font-black text-gray-500 uppercase">Vídeo Material</p>
                                        {Array.isArray(item.videoMaterial) && item.videoMaterial.length > 0 ? (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const file = item.videoMaterial![0] as any;
                                              setActiveSupplierPreview({ url: typeof file === 'string' ? file : file.url, name: typeof file === 'string' ? 'Video bruto' : (file.name || 'Video bruto'), type: 'video' });
                                            }}
                                            className="text-white hover:text-purple-400 font-bold truncate flex items-center gap-1 mt-1 text-left"
                                          >
                                            <Play className="w-3.5 h-3.5 shrink-0" /> Ver video bruto
                                          </button>
                                        ) : (
                                          <p className="text-gray-600 italic mt-1">Nenhum</p>
                                        )}
                                      </div>
                                    </div>
                                    {item.productionNotes && (
                                      <div className="bg-[#141414] p-3 rounded-2xl border border-[#222]">
                                        <p className="text-[9px] font-black text-gray-500 uppercase">Anotações</p>
                                        <p className="text-gray-300 mt-1 lines-clamp-2 leading-relaxed">{item.productionNotes}</p>
                                      </div>
                                    )}

                                    <button
                                      onClick={async () => {
                                        try {
                                          await updateDoc(doc(db, 'schedule', item.id), {
                                            status: ScheduleStatus.PLANNED,
                                            videoCode: null
                                          });
                                        } catch (err: any) {
                                          alert('Erro ao desfazer envio: ' + err.message);
                                        }
                                      }}
                                      className="w-full mt-2 py-2.5 bg-[#141414] border border-[#222] hover:border-orange-500/30 text-orange-500 hover:text-orange-400 font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                      Desfazer Envio
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Link to product */}
                    <div className="pt-6 border-t border-[#222] flex flex-col gap-3 mt-6">
                      {product.productUrl ? (
                        <a 
                          href={product.productUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="w-full py-4 bg-[#1a1a1a] hover:bg-orange-500 hover:text-black border border-[#222] text-gray-300 font-black text-xs uppercase rounded-2xl tracking-widest transition-all text-center flex items-center justify-center gap-2"
                        >
                          Ver Produto na Vitrine
                        </a>
                      ) : (
                        <button 
                          disabled
                          className="w-full py-4 bg-[#1a1a1a] opacity-40 text-gray-600 font-black text-xs uppercase rounded-2xl tracking-widest text-center cursor-not-allowed border border-[#222]"
                        >
                          Ir para o produto (Sem Link)
                        </button>
                      )}

                      {product.referenceUrl && (
                        <a 
                          href={product.referenceUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="w-full py-3 bg-orange-500/10 hover:bg-orange-500 hover:text-black border border-orange-500/25 text-orange-400 font-black text-[10px] uppercase rounded-2xl tracking-widest transition-all text-center flex items-center justify-center gap-2"
                        >
                          Ver Link de Referência
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {supplierGroupedProducts.length === 0 && (
              <div className="py-24 text-center border border-[#222] border-dashed rounded-[2.5rem] bg-[#141414]/30 space-y-4 animate-fadeIn">
                <div className="w-16 h-16 bg-[#1a1a1a] rounded-full flex items-center justify-center mx-auto opacity-20">
                  <Calendar className="w-8 h-8 text-gray-500" />
                </div>
                <div className="space-y-1 max-w-sm mx-auto">
                  <p className="text-white font-black text-sm uppercase tracking-wider">Tudo pronto por aqui!</p>
                  <p className="text-gray-500 text-xs text-balance">Nenhum lote de produto planejado para você preparar materiais nesta data.</p>
                </div>
              </div>
            )}
          </>
        ) : (
          /* GLORIOUS GEMINI CHAT SCREEN */
          <div className="grid grid-cols-1 gap-8 animate-fadeIn max-w-5xl">
            {/* Chat Conversation pane */}
            <div className="bg-[#121212] border border-[#222] rounded-[2.5rem] p-6 md:p-8 flex flex-col h-[650px] relative overflow-hidden justify-between">
              
              {/* Header inside Gemini site looks clean, with a simple Restart action */}
              <div className="flex items-center justify-between pb-3 border-b border-[#222]/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-linear-to-tr from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shrink-0 shadow-md">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-sm font-bold text-gray-200 font-sans uppercase tracking-widest bg-linear-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Gemini</span>
                </div>

                {chatMessages.length > 1 && (
                  <button
                    onClick={() => {
                      if (confirm("Deseja iniciar um novo chat com o Gemini?")) {
                        setChatMessages([
                          {
                            role: 'model',
                            text: 'Olá! Sou seu assistente Gemini do Painel do Fornecedor. 🎬\n\nEstou aqui para acelerar a preparação de seus materiais de apoio. Como posso ajudar você a produzir melhor hoje?'
                          }
                        ]);
                      }
                    }}
                    className="p-1 px-3 bg-[#0a0a0a] hover:bg-[#1a1a1a] text-xs text-gray-500 hover:text-white rounded-full transition-all border border-[#222] font-semibold tracking-wide flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Nova Conversa
                  </button>
                )}
              </div>

              {/* Chat Content Body */}
              {chatMessages.length <= 1 ? (
                /* Gemini Homelike Start Panel */
                <div className="flex-1 flex flex-col justify-center items-center text-center px-4 py-8">
                  <div className="w-12 h-12 rounded-full bg-linear-to-tr from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center text-white mb-4 animate-pulse shadow-xl shadow-blue-500/10">
                    <Sparkles className="w-5.5 h-5.5" />
                  </div>
                  <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-2">
                    <span className="bg-gradient-to-r from-[#4285f4] via-[#9b72cb] to-[#d96570] bg-clip-text text-transparent">
                      Olá, {linkedProducer?.name || user?.displayName || 'Fornecedor'}
                    </span>
                  </h1>
                  <p className="text-gray-400 text-xs md:text-sm font-medium max-w-sm mx-auto mb-8 leading-relaxed">
                    Como posso ajudar você a acelerar e otimizar seus conteúdos hoje? Escolha um atalho abaixo para começar imediatamente ou digite seu prompt.
                  </p>

                  {/* 4 Cards inline on start screen */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg px-2">
                    <button
                      onClick={() => handleSendSupplierChat("Crie ganchos (hooks) de alta retenção contendo títulos magnéticos para os produtos que estou preparando hoje.")}
                      className="p-3 bg-[#0a0a0a]/80 hover:bg-[#111118]/80 border border-[#222] hover:border-blue-500/30 text-left rounded-xl transition-all hover:scale-[1.01] active:scale-95 group cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 mb-1 text-[11px] font-bold text-white group-hover:text-blue-400 transition-colors">
                        <span className="text-sm">💡</span>
                        <span>Ganchos de Retenção</span>
                      </div>
                      <p className="text-[10px] text-gray-500 group-hover:text-gray-400 leading-normal transition-colors">Títulos magnéticos para prender atenção nos primeiros 3 segundos.</p>
                    </button>

                    <button
                      onClick={() => handleSendSupplierChat("Escreva notas de edição detalhadas (instruções de ritmo, sugestões de cortes rápidos e texto dinâmico na tela) para direcionar os editores de material.")}
                      className="p-3 bg-[#0a0a0a]/80 hover:bg-[#111118]/80 border border-[#222] hover:border-purple-500/30 text-left rounded-xl transition-all hover:scale-[1.01] active:scale-95 group cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 mb-1 text-[11px] font-bold text-white group-hover:text-purple-400 transition-colors">
                        <span className="text-sm">📝</span>
                        <span>Notas Técnicas de Edição</span>
                      </div>
                      <p className="text-[10px] text-gray-500 group-hover:text-gray-400 leading-normal transition-colors">Modelos detalhados prontos para direcionar cortes e ritmo.</p>
                    </button>

                    <button
                      onClick={() => handleSendSupplierChat("Sugira ideias de trilhas sonoras em alta, ritmos de áudio ou efeitos de áudio adequados para dar energia aos vídeos desses produtos.")}
                      className="p-3 bg-[#0a0a0a]/80 hover:bg-[#111118]/80 border border-[#222] hover:border-pink-500/30 text-left rounded-xl transition-all hover:scale-[1.01] active:scale-95 group cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 mb-1 text-[11px] font-bold text-white group-hover:text-pink-400 transition-colors">
                        <span className="text-sm">🎵</span>
                        <span>Trilhas & Efeitos</span>
                      </div>
                      <p className="text-[10px] text-gray-500 group-hover:text-gray-400 leading-normal transition-colors">Recomendações e ritmos de áudio adequados ao estilo.</p>
                    </button>

                    <button
                      onClick={() => handleSendSupplierChat("Crie legendas curtas e persuasivas e hashtags de SEO para promover os produtos desta data nas redes.")}
                      className="p-3 bg-[#0a0a0a]/80 hover:bg-[#111118]/80 border border-[#222] hover:border-emerald-500/30 text-left rounded-xl transition-all hover:scale-[1.01] active:scale-95 group cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 mb-1 text-[11px] font-bold text-white group-hover:text-emerald-400 transition-colors">
                        <span className="text-sm">📱</span>
                        <span>Legendas & Hashtags</span>
                      </div>
                      <p className="text-[10px] text-gray-500 group-hover:text-gray-400 leading-normal transition-colors">Copywriting persuasivo e hashtags estratégicas de SEO.</p>
                    </button>
                  </div>
                </div>
              ) : (
                /* Message Feed */
                <div className="flex-1 overflow-y-auto my-4 space-y-6 pr-2 max-h-[440px] scrollbar-thin scrollbar-thumb-[#222] scrollbar-track-transparent">
                  {chatMessages.map((msg, idx) => {
                    // Hide default welcome prompt in the conversational stream since it's redundant
                    if (idx === 0 && chatMessages.length > 1) return null;

                    return (
                      <div 
                        key={idx} 
                        className={`flex gap-3.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fadeIn`}
                      >
                        {msg.role === 'model' && (
                          <div className="w-7 h-7 rounded-full bg-linear-to-tr from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shrink-0 shadow-md">
                            <Sparkles className="w-3.5 h-3.5" />
                          </div>
                        )}
                        
                        <div className="relative group max-w-[85%]">
                          <div className={`p-4 rounded-3xl ${
                            msg.role === 'user'
                              ? 'bg-blue-600/10 border border-blue-500/20 text-white rounded-tr-none'
                              : 'text-gray-100 leading-relaxed text-sm whitespace-pre-wrap font-sans'
                          }`}>
                            {msg.role === 'model' ? (
                              <MarkdownText text={msg.text} />
                            ) : (
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                            )}
                          </div>

                          {msg.role === 'model' && (
                            <div className="mt-2.5 flex items-center gap-2">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(msg.text);
                                  alert("Resposta do Gemini copiada com sucesso!");
                                }}
                                className="text-gray-500 hover:text-white transition-all text-[9px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer bg-[#0a0a0a] border border-[#222] px-2.5 py-1 rounded-lg"
                              >
                                <Copy className="w-3 h-3 text-gray-500" />
                                <span>Copiar Resposta</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {msg.role === 'user' && (
                          <div className="w-7 h-7 rounded-full bg-[#1b1b22] border border-[#333] flex items-center justify-center text-gray-300 font-bold text-[10px] shrink-0 self-start uppercase italic">
                            {user?.displayName?.substring(0, 2) || "Eu"}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {chatLoading && (
                    <div className="flex gap-3.5 justify-start animate-pulse">
                      <div className="w-7 h-7 rounded-full bg-linear-to-tr from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shrink-0 shadow-md">
                        <Sparkles className="w-3.5 h-3.5 animate-spin" />
                      </div>
                      <div className="bg-[#0a0a0a] border border-[#222]/60 p-4 rounded-3xl rounded-tl-none flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Chat Input form at bottom */}
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendSupplierChat();
                }}
                className="mt-auto border-t border-[#222]/40 pt-3"
              >
                <div className="flex gap-2.5 bg-[#0a0a0a] border border-[#222] p-2 px-3 rounded-full focus-within:border-gray-500 transition-all max-w-2xl mx-auto">
                  <textarea
                    rows={1}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendSupplierChat();
                      }
                    }}
                    placeholder="Pergunte ao Gemini ou digite uma instrução..."
                    className="flex-1 bg-transparent text-white outline-none border-none py-2 px-2 text-xs md:text-sm placeholder-gray-600 resize-none max-h-[80px] scrollbar-none"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || chatLoading}
                    className={`p-2.5 rounded-full flex items-center justify-center transition-all shrink-0 ${
                      chatInput.trim() && !chatLoading
                        ? 'bg-blue-600 text-white hover:bg-blue-500 active:scale-95 cursor-pointer shadow-md shadow-blue-500/10'
                        : 'bg-[#141414] text-gray-700 cursor-not-allowed border border-[#222]/50'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            </div>

          </div>
        )}
        {activeSupplierPreview && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setActiveSupplierPreview(null)} />
            <div className="bg-[#0f0f0f] border border-[#222] p-6 rounded-[2.5rem] max-w-2xl w-full relative z-10 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-2 border-b border-[#222]">
                <h3 className="text-lg font-black text-white uppercase italic tracking-tight truncate max-w-[80%]">{activeSupplierPreview.name}</h3>
                <button onClick={() => setActiveSupplierPreview(null)} className="p-2 bg-[#1a1a1a] text-gray-400 hover:text-white rounded-full transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="bg-black rounded-2xl border border-[#222] overflow-hidden relative min-h-[220px] md:min-h-[360px] flex items-center justify-center">
                {(() => {
                  const url = activeSupplierPreview.url;
                  const driveIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
                  if (driveIdMatch && driveIdMatch[1]) {
                    return <iframe src={`https://drive.google.com/file/d/${driveIdMatch[1]}/preview`} className="w-full h-full absolute inset-0 rounded-2xl" allow="autoplay" allowFullScreen />;
                  }
                  if (url.includes('drive.google.com')) {
                    return <iframe src={url.replace('/view', '/preview').replace('/edit', '/preview')} className="w-full h-full absolute inset-0 rounded-2xl" allow="autoplay" allowFullScreen />;
                  }
                  return activeSupplierPreview.type === 'audio' ? (
                    <audio src={url} controls autoPlay className="w-full max-w-xl" referrerPolicy="no-referrer" />
                  ) : (
                    <video src={url} controls autoPlay className="w-full h-full object-contain rounded-2xl" referrerPolicy="no-referrer" />
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // When account changes, pre-fill assignments with linked products to make it easier
  useEffect(() => {
    if (newItem.accountId) {
      const account = accounts.find(a => a.id === newItem.accountId);
      const linkedIds = account?.linkedProductIds || [];
      if (linkedIds.length > 0) {
        setAssignments(linkedIds.map(id => ({ productId: id, count: 0 })));
      } else {
        setAssignments([]);
      }
    }
  }, [newItem.accountId, accounts]);

  const filteredAccountsForPlanner = useMemo(() => {
    if (!newItem.productId) return accounts;
    return accounts.filter(a => a.linkedProductIds?.includes(newItem.productId));
  }, [accounts, newItem.productId]);

  const filteredProductsForPlanner = useMemo(() => {
    if (!newItem.accountId) return products;
    const account = accounts.find(a => a.id === newItem.accountId);
    const linkedIds = account?.linkedProductIds || [];
    return products.filter(p => linkedIds.includes(p.id));
  }, [products, accounts, newItem.accountId]);

  const selectedPlannerProduct = useMemo(() => {
    return products.find(product => product.id === newItem.productId);
  }, [products, newItem.productId]);

  const productPickerOptions = useMemo(() => {
    const normalizedSearch = productPickerSearch.trim().toLocaleLowerCase('pt-BR');
    if (!normalizedSearch) return filteredProductsForPlanner;
    return filteredProductsForPlanner.filter(product =>
      product.name.toLocaleLowerCase('pt-BR').includes(normalizedSearch) ||
      (product.category || '').toLocaleLowerCase('pt-BR').includes(normalizedSearch)
    );
  }, [filteredProductsForPlanner, productPickerSearch]);

  const handleCreate = async () => {
    if (!newItem.accountId) return;
    
    // Prepare items to create
    let itemsToCreate: { productId: string }[] = [];
    
    if (postCount === 1 || distributionType === 'same') {
      const mainProductId = newItem.productId || assignments.find(a => a.count > 0)?.productId || assignments[0]?.productId || '';
      for (let i = 0; i < postCount; i++) {
        itemsToCreate.push({ productId: mainProductId });
      }
    } else {
      assignments.forEach(as => {
        for (let i = 0; i < as.count; i++) {
          itemsToCreate.push({ productId: as.productId });
        }
      });
    }

    if (itemsToCreate.length === 0) {
      // Fallback if no counts assigned but postCount > 0
      for (let i = 0; i < postCount; i++) {
        itemsToCreate.push({ productId: '' });
      }
    }

    try {
      const sameDayItems = schedule.filter(s => s.date === newItem.date);
      const maxIndex = sameDayItems.reduce((max, s) => Math.max(max, s.dailyIndex || 0), 0);
      let nextIndex = maxIndex + 1;
      const supplierBatchLoad: Record<string, number> = {};
      const getSupplierLoad = (supplierId: string) => {
        const existingLoad = schedule.filter(s =>
          s.supplierId === supplierId &&
          s.status !== ScheduleStatus.POSTED &&
          s.status !== ScheduleStatus.CANCELLED
        ).length;
        return existingLoad + (supplierBatchLoad[supplierId] || 0);
      };
      const chooseSupplierId = () => {
        if (newItem.supplierId) return newItem.supplierId;
        if (activeSuppliers.length === 0) return '';
        const workloads = activeSuppliers.map(supplier => ({ supplier, load: getSupplierLoad(supplier.id) }));
        const minLoad = Math.min(...workloads.map(w => w.load));
        const selected = workloads.find(w => w.load === minLoad)?.supplier;
        if (!selected) return '';
        supplierBatchLoad[selected.id] = (supplierBatchLoad[selected.id] || 0) + 1;
        return selected.id;
      };

      // Create entries in parallel
      await Promise.all(itemsToCreate.map((item, idx) => 
        addDoc(collection(db, 'schedule'), {
          ...newItem,
          productId: item.productId,
          producerId: '',
          supplierId: chooseSupplierId(),
          scope: viewMode === ViewMode.COMPANY ? 'COMPANY' : 'PERSONAL',
          userId: user.uid,
          dailyIndex: nextIndex + idx,
          productionCode: buildProductionCode({ ...newItem, productId: item.productId, dailyIndex: nextIndex + idx }, accounts, products, schedule),
          createdAt: serverTimestamp(),
        })
      ));
      
      setShowAdd(false);
      setPostCount(1);
      setDistributionType('same');
      setAssignments([]);
    } catch (e) { 
      handleFirestoreError(e, OperationType.CREATE, 'schedule');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este vídeo planejado?')) return;
    try {
      await deleteDoc(doc(db, 'schedule', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `schedule/${id}`);
    }
  };

  const totalAssigned = assignments.reduce((acc, curr) => acc + curr.count, 0);
  
  const handleStatusChange = async (itemId: string, newStatus: ScheduleStatus) => {
    if (newStatus === ScheduleStatus.POSTED) {
      setStatusModal({ id: itemId, targetStatus: newStatus });
      setVideoLink('');
      setLinkError(null);
      return;
    }
    
    try {
      await updateDoc(doc(db, 'schedule', itemId), { status: newStatus });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `schedule/${itemId}`);
    }
  };

  const confirmStatusUpdate = async () => {
    if (!statusModal) return;
    if (!videoLink.trim()) {
      setLinkError('O link do vídeo é obrigatório para marcar como POSTADO.');
      return;
    }

    const item = schedule.find(s => s.id === statusModal.id);
    const account = accounts.find(a => a.id === item?.accountId);
    
    if (!account) {
      setLinkError('Conta não encontrada.');
      return;
    }

    // Validation pattern: Look for @handle in the link
    const linkHandleMatch = videoLink.match(/@([a-zA-Z0-9._]+)/);
    const linkHandle = linkHandleMatch ? linkHandleMatch[1].toLowerCase() : null;
    const accountHandle = (account.handle || account.name).replace('@', '').toLowerCase();

    if (linkHandle && linkHandle !== accountHandle) {
      setLinkError(`Possível erro: O link contém @${linkHandle}, mas a conta selecionada é @${accountHandle}. Por favor, use o link correto da conta correspondente.`);
      return;
    }

    // Additional check for TikTok links specifically, as they must have @
    if (!linkHandle && videoLink.includes('tiktok.com')) {
      setLinkError('Links do TikTok devem conter o @usuario para validação de conta.');
      return;
    }

    try {
      await updateDoc(doc(db, 'schedule', statusModal.id), { 
        status: statusModal.targetStatus,
        videoLink: videoLink,
        updatedAt: serverTimestamp() 
      });
      setStatusModal(null);
      setVideoLink('');
      setLinkError(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `schedule/${statusModal.id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-xl font-bold text-white">Cronograma de Produção</h3>
          <p className="text-sm text-gray-500">Planeje onde postar e de onde tirar os vídeos.</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="bg-orange-500 text-black font-semibold py-2 px-4 rounded-xl flex items-center gap-2 shadow-[0_0_15px_rgba(249,115,22,0.3)]">
          {showAdd ? <Plus className="w-4 h-4 rotate-45" /> : <Plus className="w-4 h-4" />}
          {showAdd ? 'Cancelar' : 'Novo Post'}
        </button>
      </div>

      {showAdd && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="bg-[#141414] border border-[#222] p-8 rounded-[2rem] space-y-6 shadow-2xl relative overflow-visible"
        >
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Calendar className="w-32 h-32 text-orange-500" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Data da Postagem</label>
              <input 
                type="date" 
                className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-4 py-3 text-white outline-none focus:border-orange-500 transition-colors" 
                value={newItem.date} 
                onChange={e => setNewItem({...newItem, date: e.target.value})} 
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Conta de Destino</label>
              <select 
                className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-4 py-3 text-white outline-none focus:border-orange-500 transition-colors" 
                value={newItem.accountId} 
                onChange={e => setNewItem({...newItem, accountId: e.target.value})}
              >
                <option value="">Selecionar Conta</option>
                {filteredAccountsForPlanner.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Quantidade de Posts</label>
              <div className="flex items-center gap-2 bg-[#0a0a0a] border border-[#222] rounded-2xl p-1">
                <button 
                  onClick={() => setPostCount(Math.max(1, postCount - 1))}
                  className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-[#1a1a1a] text-gray-400"
                >
                  -
                </button>
                <input 
                  type="number"
                  className="flex-1 bg-transparent text-center text-white font-bold outline-none"
                  value={postCount}
                  onChange={e => setPostCount(Math.max(1, parseInt(e.target.value) || 1))}
                />
                <button 
                  onClick={() => setPostCount(postCount + 1)}
                  className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-[#1a1a1a] text-gray-400"
                >
                  +
                </button>
              </div>
            </div>

            {postCount > 1 && distributionType === 'different' ? (
              <div className="space-y-2 flex flex-col justify-end pb-1.5 h-full">
                <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Produto</label>
                <div className="bg-[#141414] border border-[#222]/80 px-4 py-3 rounded-2xl text-xs text-gray-400 font-bold italic h-[46px] flex items-center">
                  Definido na distribuição abaixo
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Produto Principal</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setProductPickerOpen(open => !open)}
                    className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-3 py-2 text-left outline-none focus:border-orange-500 hover:border-gray-700 transition-colors min-h-[46px] flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-xl bg-[#141414] border border-[#222] overflow-hidden flex items-center justify-center shrink-0">
                      {selectedPlannerProduct?.imageUrl ? (
                        <img src={selectedPlannerProduct.imageUrl} alt={selectedPlannerProduct.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <Hash className="w-4 h-4 text-gray-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-bold truncate ${selectedPlannerProduct ? 'text-white' : 'text-gray-500'}`}>
                        {selectedPlannerProduct?.name || 'Escolher Produto'}
                      </p>
                      <p className="text-[10px] text-gray-500 uppercase font-black tracking-wider truncate">
                        {selectedPlannerProduct?.category || 'Produto principal'}
                      </p>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${productPickerOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {productPickerOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setProductPickerOpen(false)} />
                      <div className="absolute left-0 right-0 top-full z-30 mt-2 bg-[#0f0f0f] border border-[#222] rounded-2xl shadow-2xl overflow-hidden">
                        <div className="p-3 border-b border-[#222]">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                              autoFocus
                              placeholder="Buscar produto..."
                              className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl pl-10 pr-3 py-2 text-sm text-white outline-none focus:border-orange-500"
                              value={productPickerSearch}
                              onChange={e => setProductPickerSearch(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="max-h-72 overflow-y-auto custom-scrollbar p-2 space-y-1">
                          <button
                            type="button"
                            onClick={() => {
                              setNewItem({ ...newItem, productId: '' });
                              setProductPickerSearch('');
                              setProductPickerOpen(false);
                            }}
                            className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[#1a1a1a] transition-colors"
                          >
                            <div className="w-10 h-10 rounded-xl bg-[#141414] border border-[#222] flex items-center justify-center shrink-0">
                              <Hash className="w-4 h-4 text-gray-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-gray-400 truncate">Sem produto</p>
                              <p className="text-[10px] text-gray-600 uppercase font-black tracking-wider">Planejar sem produto principal</p>
                            </div>
                          </button>

                          {productPickerOptions.map(product => {
                            const isSelected = product.id === newItem.productId;
                            return (
                              <button
                                key={product.id}
                                type="button"
                                onClick={() => {
                                  setNewItem({ ...newItem, productId: product.id });
                                  setProductPickerSearch('');
                                  setProductPickerOpen(false);
                                }}
                                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                                  isSelected ? 'bg-orange-500/10 border border-orange-500/30' : 'border border-transparent hover:bg-[#1a1a1a]'
                                }`}
                              >
                                <div className="w-10 h-10 rounded-xl bg-[#141414] border border-[#222] overflow-hidden flex items-center justify-center shrink-0">
                                  {product.imageUrl ? (
                                    <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  ) : (
                                    <Hash className="w-4 h-4 text-orange-500" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className={`text-sm font-bold truncate ${isSelected ? 'text-white' : 'text-gray-300'}`}>{product.name}</p>
                                  <p className="text-[10px] text-gray-500 uppercase font-black tracking-wider truncate">{product.category || 'Sem categoria'}</p>
                                </div>
                                {isSelected && <CheckCircle2 className="w-4 h-4 text-orange-500 shrink-0" />}
                              </button>
                            );
                          })}

                          {productPickerOptions.length === 0 && (
                            <div className="py-6 text-center text-sm text-gray-600 italic">Nenhum produto encontrado</div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {viewMode === ViewMode.COMPANY && (
              <div className="space-y-2 lg:col-span-1">
                <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Atribuir Fornecedor</label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <select 
                    className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl pl-11 pr-4 py-3 text-white outline-none focus:border-orange-500 transition-colors text-sm appearance-none" 
                    value={newItem.supplierId} 
                    onChange={e => setNewItem({...newItem, supplierId: e.target.value})}
                  >
                    <option value="">Automático</option>
                    {activeSuppliers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {postCount > 1 && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="space-y-4 pt-4 border-t border-[#222]/50"
            >
              <div className="flex flex-col md:flex-row gap-6">
                <div className="space-y-3 min-w-[200px]">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Tipo de Distribuição</label>
                  <div className="flex bg-[#0a0a0a] p-1 rounded-2xl border border-[#222]">
                    <button 
                      onClick={() => setDistributionType('same')}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${distributionType === 'same' ? 'bg-orange-500 text-black shadow-lg' : 'text-gray-500'}`}
                    >
                      Mesmo Produto
                    </button>
                    <button 
                      onClick={() => setDistributionType('different')}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${distributionType === 'different' ? 'bg-orange-500 text-black shadow-lg' : 'text-gray-500'}`}
                    >
                      Produtos Diferentes
                    </button>
                  </div>
                </div>

                {distributionType === 'different' && (
                  <div className="flex-1 space-y-3">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center justify-between">
                      <span>Vincular aos Produtos</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${totalAssigned === postCount ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                        {totalAssigned} / {postCount} posts distribuídos
                      </span>
                    </label>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {assignments.map((as, idx) => (
                        <div key={as.productId} className="flex items-center gap-3 p-3 bg-[#0a0a0a] border border-[#222] rounded-2xl">
                          <div className="flex-1 min-w-0">
                             <p className="text-xs font-bold text-white truncate">{products.find(p => p.id === as.productId)?.name || 'Desconhecido'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                             <button 
                               onClick={() => {
                                 const next = [...assignments];
                                 next[idx].count = Math.max(0, next[idx].count - 1);
                                 setAssignments(next);
                               }}
                               className="w-6 h-6 rounded-lg bg-[#1a1a1a] text-white text-xs hover:bg-orange-500 hover:text-black transition-colors"
                             >
                               -
                             </button>
                             <span className="text-sm font-black text-white w-4 text-center">{as.count}</span>
                             <button 
                               onClick={() => {
                                 if (totalAssigned < postCount) {
                                   const next = [...assignments];
                                   next[idx].count += 1;
                                   setAssignments(next);
                                 }
                               }}
                               className="w-6 h-6 rounded-lg bg-[#1a1a1a] text-white text-xs hover:bg-orange-500 hover:text-black transition-colors"
                             >
                               +
                             </button>
                          </div>
                        </div>
                      ))}
                      <button 
                        onClick={() => {
                          const unassigned = products.find(p => !assignments.find(as => as.productId === p.id));
                          if (unassigned) setAssignments([...assignments, { productId: unassigned.id, count: 0 }]);
                        }}
                        className="flex items-center justify-center gap-2 p-3 border border-[#222] border-dashed rounded-2xl text-gray-500 hover:text-orange-500 hover:border-orange-500/50 transition-all text-xs font-bold"
                      >
                        <Plus className="w-4 h-4" /> Adicionar Produto
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          <div className="flex justify-end pt-4">
            <button 
              onClick={handleCreate} 
              disabled={!newItem.accountId || (distributionType === 'different' && postCount > 1 && totalAssigned !== postCount)}
              className={`px-12 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${
                !newItem.accountId || (distributionType === 'different' && postCount > 1 && totalAssigned !== postCount)
                  ? 'bg-[#1a1a1a] text-gray-600 cursor-not-allowed'
                  : 'bg-white text-black hover:bg-orange-500 hover:shadow-[0_0_30px_rgba(249,115,22,0.4)]'
              }`}
            >
              Confirmar Planejamento
            </button>
          </div>
        </motion.div>
      )}

      <div className="bg-[#141414] border border-[#222] rounded-3xl overflow-hidden shadow-2xl relative">
        <div className="p-8 border-b border-[#222] bg-[#1a1a1a]/30 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-500/10 rounded-2xl">
              <Clock className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <h4 className="text-white font-bold text-lg">Próximos Vídeos</h4>
              <p className="text-xs text-gray-500">Fluxo cronológico de postagens</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative group">
               <Filter className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition-colors" />
            </div>
            <span className="text-xs font-bold text-gray-600 uppercase tracking-widest">Filtrar</span>
          </div>
        </div>
        <div className="divide-y divide-[#222]">
          {schedule.filter(item => item.status !== ScheduleStatus.POSTED).sort((a, b) => b.date.localeCompare(a.date)).map(item => (
            <div key={item.id} className="p-6 flex flex-wrap items-center justify-between gap-6 hover:bg-[#1a1a1a]/50 transition-all group">
              <div className="flex items-center gap-6">
                <div className="flex flex-col items-center justify-center p-3 bg-[#0a0a0a] border border-[#222] rounded-2xl min-w-[72px] shadow-inner group-hover:border-orange-500/30 transition-colors">
                  <span className="text-[10px] font-black text-orange-500 uppercase tracking-tighter">{new Date(item.date).toLocaleDateString('pt-BR', { weekday: 'short' })}</span>
                  <span className="text-2xl font-black text-white">{item.date.split('-')[2]}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                     <h5 className="text-white font-black text-base">
                       {accounts.find(a => a.id === item.accountId)?.name}
                       <span className="ml-2 text-[10px] text-orange-500 font-black">#{videoDisplayNames[item.id]}</span>
                     </h5>
                     <span className="text-[9px] px-2 py-1 bg-[#222] text-gray-400 rounded-lg uppercase font-black tracking-widest border border-[#333]">
                       {accounts.find(a => a.id === item.accountId)?.platform}
                     </span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-500 text-sm">
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-[#1a1a1a] rounded-lg">
                      <span className="font-medium text-gray-400">{products.find(p => p.id === item.productId)?.name || 'Geral/Misc'}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-8">
                {item.videoSource && (
                  <div className="hidden xl:flex items-center gap-3 px-4 py-2 bg-orange-500/5 text-orange-400 border border-orange-500/10 rounded-2xl text-[11px] font-medium italic relative overflow-hidden">
                    <div className="absolute inset-0 bg-orange-500/5 animate-pulse" />
                    <Video className="w-4 h-4 relative z-10" />
                    <span className="max-w-[250px] truncate relative z-10">{item.videoSource}</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => handleDelete(item.id)}
                    className="p-3 text-gray-600 hover:text-red-500 transition-colors bg-[#0a0a0a] border border-[#222] rounded-2xl md:opacity-0 md:group-hover:opacity-100 shadow-inner"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="relative group/status">
                    <select 
                      className={`text-[10px] font-black uppercase rounded-2xl px-6 py-3 bg-[#0a0a0a] border border-[#222] cursor-pointer transition-all outline-none appearance-none pr-10 hover:border-gray-600 ${
                        item.status === ScheduleStatus.POSTED ? 'text-green-500 border-green-500/30 bg-green-500/5' : 
                        item.status === ScheduleStatus.PRODUCED ? 'text-blue-500 border-blue-500/30 bg-blue-500/5' : 'text-orange-500 border-orange-500/30 bg-orange-500/5'
                      }`}
                      value={item.status}
                      onChange={(e) => handleStatusChange(item.id, e.target.value as ScheduleStatus)}
                    >
                      {Object.values(ScheduleStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none group-hover/status:text-gray-300" />
                  </div>
                </div>
              </div>
            </div>
          ))}
          {schedule.filter(item => item.status !== ScheduleStatus.POSTED).length === 0 && (
            <div className="p-24 text-center space-y-4">
              <div className="w-16 h-16 bg-[#1a1a1a] rounded-full flex items-center justify-center mx-auto opacity-20">
                <Calendar className="w-8 h-8 text-gray-500" />
              </div>
              <p className="text-gray-600 italic font-medium">Nenhuma postagem no radar</p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {statusModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }} 
               exit={{ opacity: 0 }}
               className="absolute inset-0 bg-black/80 backdrop-blur-sm"
               onClick={() => setStatusModal(null)}
             />
             <motion.div 
               initial={{ scale: 0.9, opacity: 0, y: 20 }}
               animate={{ scale: 1, opacity: 1, y: 0 }}
               exit={{ scale: 0.9, opacity: 0, y: 20 }}
               className="bg-[#141414] border border-[#222] p-8 rounded-[2.5rem] max-w-md w-full relative z-10 shadow-2xl"
             >
                <div className="w-16 h-16 bg-orange-500/10 rounded-2xl flex items-center justify-center mb-6 border border-orange-500/20">
                  <CheckCircle2 className="w-8 h-8 text-orange-500" />
                </div>
                <h3 className="text-2xl font-black text-white mb-2">Confirmar Postagem</h3>
                <p className="text-gray-500 text-sm mb-6">
                  Para marcar este vídeo como <span className="text-green-500 font-bold">postado</span>, insira o link oficial do conteúdo abaixo para verificação.
                </p>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Link do Vídeo</label>
                    <input 
                      type="text" 
                      placeholder="https://tiktok.com/@usuario/video/..."
                      className={`w-full bg-[#0a0a0a] border ${linkError ? 'border-red-500/50' : 'border-[#222]'} rounded-2xl px-5 py-4 text-white outline-none focus:border-orange-500 transition-all font-medium`}
                      value={videoLink}
                      onChange={(e) => {
                        setVideoLink(e.target.value);
                        if (linkError) setLinkError(null);
                      }}
                      autoFocus
                    />
                    {linkError && (
                      <p className="text-xs text-red-500 font-medium px-1 flex items-center gap-1.5 mt-2">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {linkError}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button 
                      onClick={() => setStatusModal(null)}
                      className="flex-1 py-4 bg-[#1a1a1a] border border-[#222] text-gray-500 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-[#222] hover:text-white transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={confirmStatusUpdate}
                      className="flex-1 py-4 bg-white text-black font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-orange-500 transition-all shadow-xl"
                    >
                      Confirmar
                    </button>
                  </div>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProductManager({ products, producers, user, subView, isPartner, ProtectedValue, viewMode, setActiveTab }: { products: Product[], producers: Producer[], user: FirebaseUser, subView: 'new' | 'edit', isPartner: boolean, ProtectedValue: any, viewMode: ViewMode, setActiveTab: (t: string) => void }) {
  const [newProd, setNewProd] = useState({ name: '', category: '', winningStatus: WinningStatus.TESTING, price: 0, commissionValue: 0, imageUrl: '', productUrl: '', referenceUrl: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [createProductError, setCreateProductError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const creatingProductRef = useRef(false);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>, isEditing: boolean) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Imagem muito grande. O limite é 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        if (isEditing && editingProduct) {
          setEditingProduct({ ...editingProduct, imageUrl: base64 });
        } else {
          setNewProd({ ...newProd, imageUrl: base64 });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreate = async () => {
    if (creatingProductRef.current) return;

    const productName = newProd.name.trim();
    const normalizedProductName = productName.toLocaleLowerCase('pt-BR');
    setCreateProductError(null);

    if (!productName) {
      setCreateProductError('Informe o nome do produto antes de adicionar à base.');
      return;
    }

    const alreadyExists = products.some(product => product.name.trim().toLocaleLowerCase('pt-BR') === normalizedProductName);
    if (alreadyExists) {
      setCreateProductError('Já existe um produto com esse nome na base.');
      return;
    }

    creatingProductRef.current = true;
    setIsCreatingProduct(true);

    try {
      const docRef = await addDoc(collection(db, 'products'), { 
        ...newProd,
        name: productName,
        category: newProd.category.trim(),
        productUrl: newProd.productUrl.trim(),
        referenceUrl: newProd.referenceUrl.trim(),
        userId: user.uid,
        scope: viewMode === ViewMode.COMPANY ? 'COMPANY' : 'PERSONAL',
        createdAt: new Date().toISOString()
      });

      const activeEditors = producers.filter(p => isProducerAvailableForRole(p, 'editor'));
      const editorLinkResults = await Promise.allSettled(activeEditors.map(editor =>
        updateDoc(doc(db, 'producers', editor.id), {
          linkedProductIds: arrayUnion(docRef.id)
        })
      ));
      const failedEditorLinks = editorLinkResults.filter(result => result.status === 'rejected').length;

      setNewProd({ name: '', category: '', winningStatus: WinningStatus.TESTING, price: 0, commissionValue: 0, imageUrl: '', productUrl: '', referenceUrl: '' });
      setActiveTab('products_edit');
      if (failedEditorLinks > 0) {
        alert(`Produto criado, mas ${failedEditorLinks} editor(es) não foram vinculados automaticamente. Tente vincular novamente ou verifique as permissões.`);
      }
    } catch (e) { 
      setCreateProductError(e instanceof Error ? e.message : 'Não foi possível adicionar o produto à base. Tente novamente.');
      handleFirestoreError(e, OperationType.CREATE, 'products');
    } finally {
      creatingProductRef.current = false;
      setIsCreatingProduct(false);
    }
  };

  const handleUpdateProduct = async () => {
    if (!editingProduct || !editingProduct.name) return;
    try {
      await updateDoc(doc(db, 'products', editingProduct.id), {
        name: editingProduct.name,
        imageUrl: editingProduct.imageUrl || '',
        category: editingProduct.category || '',
        productUrl: editingProduct.productUrl || '',
        referenceUrl: editingProduct.referenceUrl || ''
      });
      setEditingProduct(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `products/${editingProduct.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;
    try {
      await deleteDoc(doc(db, 'products', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `products/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h3 className="text-xl font-bold text-white capitalize">
          {subView === 'new' ? 'Registrar Novo Produto' : 'Editar Produtos da Base'}
        </h3>
        {subView === 'edit' && (
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input 
              placeholder="Buscar produtos..." 
              className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:border-orange-500 transition-colors outline-none"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        )}
      </div>

      {subView === 'new' && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="bg-[#141414] border border-[#222] p-8 rounded-[2rem] space-y-6 shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Zap className="w-32 h-32 text-white" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Nome do Produto</label>
              <input 
                placeholder="Ex: Mini Processador Portátil" 
                className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-4 py-3 text-white outline-none focus:border-orange-500 transition-colors" 
                value={newProd.name} 
                onChange={e => {
                  setNewProd({...newProd, name: e.target.value});
                  if (createProductError) setCreateProductError(null);
                }} 
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Categoria (Opcional)</label>
              <input 
                placeholder="Ex: Cozinha, Automotivo" 
                className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-4 py-3 text-white outline-none focus:border-orange-500 transition-colors" 
                value={newProd.category} 
                onChange={e => setNewProd({...newProd, category: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Status Inicial</label>
              <select 
                className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-4 py-3 text-white outline-none focus:border-orange-500 transition-colors appearance-none" 
                value={newProd.winningStatus} 
                onChange={e => setNewProd({...newProd, winningStatus: e.target.value as any})}
              >
                {Object.values(WinningStatus).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Link do Produto</label>
              <input 
                placeholder="Ex: https://shopee.com.br/produto..." 
                className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-4 py-3 text-white outline-none focus:border-orange-500 transition-colors" 
                value={newProd.productUrl || ''} 
                onChange={e => setNewProd({...newProd, productUrl: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Link Referência</label>
              <input 
                placeholder="Ex: https://ferramenta.com/referência..." 
                className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-4 py-3 text-white outline-none focus:border-orange-500 transition-colors" 
                value={newProd.referenceUrl || ''} 
                onChange={e => setNewProd({...newProd, referenceUrl: e.target.value})} 
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Logo / Foto do Produto</label>
              <div className="flex items-center gap-4 p-4 bg-[#0a0a0a] border-2 border-dashed border-[#222] rounded-2xl hover:border-orange-500/50 transition-all group">
                <div className="w-16 h-16 rounded-2xl bg-[#141414] border border-[#222] overflow-hidden flex items-center justify-center shrink-0">
                  {newProd.imageUrl ? (
                    <img src={newProd.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <ImagePlus className="w-6 h-6 text-gray-700" />
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-bold text-white">Selecione uma imagem</p>
                  <p className="text-[10px] text-gray-500 font-medium">Recomendado: 500x500px (PNG ou JPG)</p>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={(e) => handleFileChange(e, false)}
                  />
                  <div className="flex gap-2 pt-1">
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[10px] font-black uppercase tracking-wider text-orange-500 hover:text-orange-400 bg-orange-500/10 px-3 py-1.5 rounded-lg border border-orange-500/20"
                    >
                      Fazer Upload
                    </button>
                    {newProd.imageUrl && (
                      <button 
                        onClick={() => setNewProd({...newProd, imageUrl: ''})}
                        className="text-[10px] font-black uppercase tracking-wider text-red-500 hover:text-red-400 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {isPartner && (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Preço (R$)</label>
                  <input 
                    type="number"
                    placeholder="Ex: 49.90" 
                    className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-4 py-3 text-white outline-none focus:border-orange-500 transition-colors" 
                    value={newProd.price || ''} 
                    onChange={e => setNewProd({...newProd, price: parseFloat(e.target.value) || 0})} 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Comissão por Unidade (R$)</label>
                  <input 
                    type="number"
                    placeholder="Ex: 5.50" 
                    className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-4 py-3 text-white outline-none focus:border-orange-500 transition-colors" 
                    value={newProd.commissionValue || ''} 
                    onChange={e => setNewProd({...newProd, commissionValue: parseFloat(e.target.value) || 0})} 
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-3 pt-4 md:flex-row md:items-center md:justify-end">
            {createProductError && (
              <div className="flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-400 md:mr-auto">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{createProductError}</span>
              </div>
            )}
            <button 
              onClick={handleCreate} 
              disabled={isCreatingProduct}
              className={`bg-white text-black px-12 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${
                isCreatingProduct
                  ? 'opacity-60 cursor-not-allowed'
                  : 'hover:bg-orange-500 hover:shadow-[0_0_30px_rgba(249,115,22,0.4)]'
              }`}
            >
              Adicionar à Base
            </button>
          </div>
        </motion.div>
      )}

      {subView === 'edit' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map(p => (
            <div key={p.id} className="bg-[#141414] border border-[#222] p-6 rounded-2xl flex flex-col gap-4 group hover:border-gray-700 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-[#1a1a1a] rounded-xl flex items-center justify-center overflow-hidden border border-[#222]">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <Hash className="w-4 h-4 text-orange-500" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-white font-bold leading-tight">{p.name}</h4>
                      <button onClick={() => setEditingProduct(p)} className="text-gray-600 hover:text-white transition-colors">
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-500 uppercase font-bold">{p.category || 'Sem Categoria'}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-auto pt-4 border-t border-[#222]">
                <div className="flex flex-col gap-1">
                  <span className="text-[8px] text-gray-500 uppercase font-black">Preço / Comissão</span>
                  <div className="flex gap-2">
                     <span className="text-[10px] text-white font-bold">
                       <ProtectedValue prefix="R$ " value={p.price?.toFixed(2) || '0.00'} />
                     </span>
                     <span className="text-[10px] text-green-500 font-bold">
                       <ProtectedValue prefix="R$ " value={p.commissionValue?.toFixed(2) || '0.00'} />
                     </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                   <div className="flex flex-col gap-1">
                    <span className="text-[8px] text-gray-500 uppercase font-black text-right">Estágio</span>
                    <span className={`text-[9px] uppercase font-bold px-2 py-1 rounded-md border text-center ${
                      p.winningStatus === WinningStatus.WINNER || p.winningStatus === WinningStatus.SCALED 
                        ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                        : 'bg-[#1a1a1a] text-gray-500 border-[#222]'
                    }`}>
                      {phaseMap[p.winningStatus] || p.winningStatus}
                    </span>
                   </div>
                </div>
              </div>

              {isPartner && (
                <div className="flex justify-between items-center bg-[#0a0a0a] p-3 rounded-xl gap-2">
                  <div className="flex-1">
                     <p className="text-[8px] text-gray-500 font-black uppercase">Editar Preço</p>
                     <input 
                       type="number"
                       step="0.01"
                       className="bg-transparent border-none text-white text-xs w-full outline-none focus:text-orange-500 font-bold"
                       value={p.price || ''}
                       onChange={async (e) => {
                         try {
                           await updateDoc(doc(db, 'products', p.id), { price: parseFloat(e.target.value) || 0 });
                         } catch (err) {
                           handleFirestoreError(err, OperationType.UPDATE, `products/${p.id}`);
                         }
                       }}
                     />
                  </div>
                  <div className="flex-1 text-right">
                     <p className="text-[8px] text-gray-500 font-black uppercase">Editar Comis.</p>
                     <input 
                       type="number"
                       step="0.01"
                       className="bg-transparent border-none text-green-500 text-xs w-full text-right outline-none focus:text-white font-bold"
                       value={p.commissionValue || ''}
                       onChange={async (e) => {
                         try {
                           await updateDoc(doc(db, 'products', p.id), { commissionValue: parseFloat(e.target.value) || 0 });
                         } catch (err) {
                           handleFirestoreError(err, OperationType.UPDATE, `products/${p.id}`);
                         }
                       }}
                     />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleDelete(p.id)}
                    className="p-2 bg-[#1a1a1a] rounded-lg text-gray-500 hover:text-red-500 transition-colors border border-[#222]"
                    title="Excluir Produto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <div className="relative group/edit">
                    <select 
                      className="bg-[#1a1a1a] border border-[#222] rounded-lg text-[10px] text-gray-400 px-2 py-1 outline-none focus:border-orange-500 appearance-none pointer-events-auto"
                      value={p.winningStatus}
                      onChange={async (e) => {
                        try {
                          await updateDoc(doc(db, 'products', p.id), { winningStatus: e.target.value as any });
                        } catch (err) {
                          handleFirestoreError(err, OperationType.UPDATE, `products/${p.id}`);
                        }
                      }}
                    >
                      {Object.values(WinningStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex gap-1.5">
                  {p.productUrl && (
                    <a 
                      href={p.productUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="p-2 bg-[#1a1a1a] hover:bg-orange-500/10 text-orange-500 rounded-lg border border-[#222] transition-colors flex items-center justify-center"
                      title="Abrir Link do Produto"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {p.referenceUrl && (
                    <a 
                      href={p.referenceUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="p-2 bg-[#1a1a1a] hover:bg-blue-500/10 text-blue-400 rounded-lg border border-[#222] transition-colors flex items-center justify-center"
                      title="Abrir Link de Referência"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filteredProducts.length === 0 && (
            <div className="col-span-full py-16 text-center text-gray-500 opacity-50">Nenhum produto cadastrado</div>
          )}
        </div>
      )}

      {/* Product Editing Modal */}
      <AnimatePresence>
        {editingProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setEditingProduct(null)} 
              className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#141414] border border-[#222] w-full max-w-md rounded-3xl overflow-hidden shadow-2xl relative z-10"
            >
              <div className="p-6 border-b border-[#222] flex items-center justify-between">
                <h3 className="text-white font-bold">Editar Produto</h3>
                <button onClick={() => setEditingProduct(null)} className="text-gray-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="flex justify-center">
                  <div className="relative group/photo">
                    <div className="w-24 h-24 bg-[#0a0a0a] border-2 border-[#222] rounded-2xl overflow-hidden flex items-center justify-center">
                      {editingProduct.imageUrl ? (
                        <img src={editingProduct.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <Camera className="w-8 h-8 text-gray-700" />
                      )}
                    </div>
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl pointer-events-none">
                       <Pencil className="w-5 h-5 text-white" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Nome do Produto</label>
                    <input 
                      placeholder="Ex: Mini Processador"
                      className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl px-4 py-3 text-white outline-none focus:border-orange-500 transition-colors"
                      value={editingProduct.name}
                      onChange={e => setEditingProduct({...editingProduct, name: e.target.value})}
                    />
                  </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Foto do Produto</label>
                  <div className="flex items-center gap-4 p-4 bg-[#0a0a0a] border border-[#222] rounded-2xl">
                    <div className="w-16 h-16 rounded-xl bg-[#141414] border border-[#222] overflow-hidden flex items-center justify-center shrink-0">
                      {editingProduct.imageUrl ? (
                        <img src={editingProduct.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <ImagePlus className="w-6 h-6 text-gray-700" />
                      )}
                    </div>
                    <div className="flex-1">
                       <input 
                         type="file" 
                         accept="image/*" 
                         className="hidden" 
                         ref={editFileInputRef}
                         onChange={(e) => handleFileChange(e, true)}
                       />
                       <button 
                         onClick={() => editFileInputRef.current?.click()}
                         className="w-full py-2 bg-[#1a1a1a] border border-[#222] text-gray-400 font-bold text-[10px] uppercase rounded-lg hover:text-white transition-colors"
                       >
                         Alterar Foto
                       </button>
                    </div>
                  </div>
                </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Categoria</label>
                    <input 
                      placeholder="Ex: Cozinha"
                      className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl px-4 py-3 text-white outline-none focus:border-orange-500 transition-colors"
                      value={editingProduct.category || ''}
                      onChange={e => setEditingProduct({...editingProduct, category: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Link do Produto</label>
                    <input 
                      placeholder="Ex: https://shopee.com.br/produto..."
                      className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl px-4 py-3 text-white outline-none focus:border-orange-500 transition-colors"
                      value={editingProduct.productUrl || ''}
                      onChange={e => setEditingProduct({...editingProduct, productUrl: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Link Referência</label>
                    <input 
                      placeholder="Ex: https://ferramenta.com/referência..."
                      className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl px-4 py-3 text-white outline-none focus:border-orange-500 transition-colors"
                      value={editingProduct.referenceUrl || ''}
                      onChange={e => setEditingProduct({...editingProduct, referenceUrl: e.target.value})}
                    />
                  </div>
                </div>
              </div>
              
              <div className="p-6 bg-[#0c0c0c] border-t border-[#222] flex gap-3">
                <button 
                  onClick={() => setEditingProduct(null)}
                  className="flex-1 bg-[#1a1a1a] text-gray-400 py-3 rounded-xl font-bold hover:bg-[#222] hover:text-white transition-colors border border-[#222]"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleUpdateProduct}
                  className="flex-1 bg-white text-black py-3 rounded-xl font-bold hover:bg-orange-500 transition-all shadow-[0_0_20px_rgba(249,115,22,0.2)]"
                >
                  Salvar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ViolationTracker({ violations, accounts, user, viewMode }: { violations: Violation[], accounts: Account[], user: FirebaseUser, viewMode: ViewMode }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newVio, setNewVio] = useState({ accountId: '', pointsDeducted: 0, description: '' });

  const handleCreate = async () => {
    if (!newVio.accountId) return;
    try {
      const account = accounts.find(a => a.id === newVio.accountId);
      if (account) {
        const newPoints = account.healthPoints - (newVio.pointsDeducted || 0);
        await updateDoc(doc(db, 'accounts', account.id), { 
          healthPoints: newPoints,
          status: newPoints <= 0 ? AccountStatus.SUSPENDED : account.status
        });
      }
      await addDoc(collection(db, 'violations'), { 
        ...newVio, 
        userId: user.uid, 
        scope: viewMode === ViewMode.COMPANY ? 'COMPANY' : 'PERSONAL',
        date: new Date().toISOString(), 
        resolved: false 
      });
      setShowAdd(false);
      setNewVio({ accountId: '', pointsDeducted: 0, description: '' });
    } catch (e) { 
      handleFirestoreError(e, OperationType.CREATE, 'violations');
    }
  };

  return (
    <div className="space-y-6">
       <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white">Central de Violações</h3>
          <p className="text-sm text-gray-500">Histórico de problemas e restrições por conta.</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="bg-red-500 text-white font-semibold py-2 px-4 rounded-xl flex items-center gap-2 hover:bg-red-400">
          <AlertTriangle className="w-4 h-4" /> Reportar Problema
        </button>
      </div>

      {showAdd && (
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-[#141414] border border-[#222] p-6 rounded-2xl space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="space-y-1">
               <label className="text-[10px] font-bold text-gray-500 uppercase px-1">Conta Afetada</label>
               <select className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl px-4 py-2 text-white" value={newVio.accountId} onChange={e => setNewVio({...newVio, accountId: e.target.value})}>
                  <option value="">Selecionar Conta</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.healthPoints} pts)</option>)}
               </select>
             </div>
             <div className="space-y-1">
               <label className="text-[10px] font-bold text-gray-500 uppercase px-1">Pontos Perdidos</label>
               <input 
                 type="number"
                 placeholder="Ex: 8"
                 className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl px-4 py-2 text-white outline-none focus:border-red-500"
                 value={newVio.pointsDeducted}
                 onChange={e => setNewVio({...newVio, pointsDeducted: parseInt(e.target.value)})}
               />
             </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase px-1">Descrição</label>
            <textarea placeholder="Descreva o que aconteceu..." className="w-full h-24 bg-[#0a0a0a] border border-[#222] rounded-xl px-4 py-2 text-white outline-none focus:border-red-500" value={newVio.description} onChange={e => setNewVio({...newVio, description: e.target.value})} />
          </div>
          <button onClick={handleCreate} className="w-full bg-red-500 text-white py-2 rounded-xl font-bold">Registrar Violação</button>
        </motion.div>
      )}

      <div className="bg-[#141414] border border-[#222] rounded-2xl overflow-hidden shadow-xl">
        <div className="divide-y divide-[#222]">
          {violations.sort((a,b) => b.date.localeCompare(a.date)).map(v => (
            <div key={v.id} className="p-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-4 flex-1">
                <div className={`p-3 rounded-2xl ${
                  v.pointsDeducted >= 12 ? 'bg-red-500/20 text-red-500' : 
                  v.pointsDeducted >= 6 ? 'bg-orange-500/20 text-orange-500' : 'bg-yellow-500/20 text-yellow-500'
                }`}>
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h5 className="text-white font-bold">{accounts.find(a => a.id === v.accountId)?.name || 'Conta Removida'}</h5>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-black uppercase bg-red-500 text-black">-{v.pointsDeducted || 0} PTS</span>
                  </div>
                  <p className="text-gray-500 text-xs mt-0.5">{new Date(v.date).toLocaleDateString('pt-BR')} • {new Date(v.date).toLocaleTimeString('pt-BR')}</p>
                  <p className="text-gray-400 mt-2 text-sm max-w-2xl">{v.description}</p>
                </div>
              </div>
              <button 
                onClick={async () => {
                  try {
                    await updateDoc(doc(db, 'violations', v.id), { resolved: !v.resolved });
                  } catch (e) {
                    handleFirestoreError(e, OperationType.UPDATE, `violations/${v.id}`);
                  }
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                  v.resolved 
                    ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                    : 'bg-[#1a1a1a] text-gray-500 border-[#222] hover:text-white'
                }`}
              >
                {v.resolved ? '✓ Resolvida' : 'Marcar como Resolvida'}
              </button>
            </div>
          ))}
          {violations.length === 0 && <div className="p-16 text-center text-gray-500 italic">Nenhuma violação registrada. Sua operação está segura!</div>}
        </div>
      </div>
    </div>
  );
}

function SalesRegistry({ sales, products, accounts, schedule, tiktokLinks, user, isPartner, ProtectedValue, viewMode }: { sales: Sale[], products: Product[], accounts: Account[], schedule: ScheduleItem[], tiktokLinks: Array<any>, user: FirebaseUser, isPartner: boolean, ProtectedValue: any, viewMode: ViewMode }) {
  const [newSale, setNewSale] = useState({ 
    startDate: getLocalDateString(), 
    endDate: getLocalDateString(),
    productId: '', 
    accountId: '', 
    scheduleItemId: '', 
    quantity: 1 
  });
  const [showAdd, setShowAdd] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getDatesInRange = (start: string, end: string) => {
    const dates = [];
    let current = new Date(start);
    const last = new Date(end);
    
    // Add time to avoid timezone issues during loop
    current.setHours(12,0,0,0);
    last.setHours(12,0,0,0);

    while (current <= last) {
      dates.push(getLocalDateString(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const handleCreate = async () => {
  const selectedItem = schedule.find(s => s.id === newSale.scheduleItemId);
  const productId = selectedItem?.productId || newSale.productId;
  const accountId = selectedItem?.accountId || newSale.accountId;

  if (!newSale.scheduleItemId || !productId || !accountId || !newSale.quantity || !newSale.startDate || !newSale.endDate) {
    alert('Selecione primeiro o vídeo. O produto, a conta e o criador serão vinculados automaticamente.');
    return;
  }

  const product = products.find(p => p.id === productId);
  if (!product) return;

  setIsSubmitting(true);

  const gmv = (product.price || 0) * newSale.quantity;
  const commission = (product.commissionValue || 0) * newSale.quantity;
  const dates = getDatesInRange(newSale.startDate, newSale.endDate);

  const linkedTikTokLink = tiktokLinks.find(lnk => lnk.scheduleItemId === newSale.scheduleItemId || lnk.id === selectedItem?.creatorLinkId);
  const resolvedCreator = resolveCreatorHandle(
    selectedItem,
    linkedTikTokLink,
    accounts,
    (selectedItem as any)?._tempCreatorInput || ''
  );

  try {
    const promises = dates.map(date =>
      addDoc(collection(db, 'sales'), {
        date,
        productId,
        accountId,
        scheduleItemId: newSale.scheduleItemId,
        creatorHandle: resolvedCreator,
        quantity: newSale.quantity,
        gmv,
        commission,
        userId: user.uid,
        scope: viewMode === ViewMode.COMPANY ? 'COMPANY' : 'PERSONAL',
        createdAt: new Date().toISOString()
      })
    );

    await Promise.all(promises);

    setShowAdd(false);
    setNewSale({
      startDate: getLocalDateString(),
      endDate: getLocalDateString(),
      productId: '',
      accountId: '',
      scheduleItemId: '',
      quantity: 1
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'sales');
  } finally {
    setIsSubmitting(false);
  }
};

  const totalGmv = sales.reduce((acc, s) => acc + s.gmv, 0);
  const totalCommission = sales.reduce((acc, s) => acc + s.commission, 0);

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este registro de venda?')) return;
    try {
      await deleteDoc(doc(db, 'sales', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `sales/${id}`);
    }
  };

  const filteredAccountsForSales = useMemo(() => {
    if (!newSale.productId) return accounts;
    return accounts.filter(a => a.linkedProductIds?.includes(newSale.productId));
  }, [accounts, newSale.productId]);

  const filteredProductsForSales = useMemo(() => {
    if (!newSale.accountId) return products;
    const account = accounts.find(a => a.id === newSale.accountId);
    const linkedIds = account?.linkedProductIds || [];
    return products.filter(p => linkedIds.includes(p.id));
  }, [products, accounts, newSale.accountId]);

  // Filter schedule items that are POSTED and belong to the selected account/product
  const filteredVideos = useMemo(() => {
    return schedule.filter(s => 
      s.status === ScheduleStatus.POSTED && 
      (newSale.accountId ? s.accountId === newSale.accountId : true) &&
      (newSale.productId ? s.productId === newSale.productId : true)
    ).sort((a, b) => a.date.localeCompare(b.date));
  }, [schedule, newSale.accountId, newSale.productId]);

  const videoDisplayNames = useMemo(() => {
    const counts: Record<string, number> = {};
    const result: Record<string, string> = {};

    // Use total schedule for consistent numbering across the platform (per account/date)
    const sortedAll = [...schedule]
      .filter(s => s.status === ScheduleStatus.POSTED)
      .sort((a, b) => a.date.localeCompare(b.date));

    sortedAll.forEach(v => {
      const key = `${v.accountId}_${v.date}`;
      counts[key] = (counts[key] || 0) + 1;
      
      const dateParts = v.date.split('-');
      const displayDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}` : v.date;
      
      result[v.id] = `${displayDate} nº ${counts[key]}`;
    });

    return result;
  }, [schedule]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-xl font-bold text-white">Registro de Vendas</h3>
          <p className="text-sm text-gray-500">Acompanhe seu GMV e comissões geradas.</p>
        </div>
        <button 
          onClick={() => setShowAdd(!showAdd)} 
          className="bg-orange-500 text-black font-semibold py-2 px-6 rounded-xl flex items-center gap-2 hover:bg-orange-400 transition-colors shadow-lg shadow-orange-500/20"
        >
          {showAdd ? <Plus className="w-4 h-4 rotate-45" /> : <Plus className="w-4 h-4" />}
          {showAdd ? 'Cancelar' : 'Registrar Venda'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#141414] border border-[#222] p-6 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 rounded-xl">
            <TrendingUp className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase font-black">GMV Total</p>
            <p className="text-2xl font-black text-white">
              <ProtectedValue prefix="R$ " value={totalGmv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} />
            </p>
          </div>
        </div>
        <div className="bg-[#141414] border border-[#222] p-6 rounded-2xl flex items-center gap-4 border-l-4 border-l-green-500">
          <div className="p-3 bg-green-500/10 rounded-xl">
            <DollarSign className="w-6 h-6 text-green-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase font-black">Comissão Total</p>
            <p className="text-2xl font-black text-green-500">
              <ProtectedValue prefix="R$ " value={totalCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} />
            </p>
          </div>
        </div>
      </div>

      {showAdd && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="bg-[#141414] border border-[#222] p-8 rounded-[2rem] space-y-6 shadow-2xl"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">De (Data Inicial)</label>
              <input 
                type="date" 
                className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-4 py-3 text-white outline-none focus:border-orange-500 transition-colors" 
                value={newSale.startDate}
                onChange={e => setNewSale({...newSale, startDate: e.target.value, endDate: e.target.value > newSale.endDate ? e.target.value : newSale.endDate})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Até (Data Final)</label>
              <input 
                type="date" 
                className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-4 py-3 text-white outline-none focus:border-orange-500 transition-colors" 
                value={newSale.endDate}
                min={newSale.startDate}
                onChange={e => setNewSale({...newSale, endDate: e.target.value})}
              />
            </div>
            <div className="space-y-2">
  <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Vídeo</label>
  <select
    className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-4 py-3 text-white outline-none focus:border-orange-500 transition-colors"
    value={newSale.scheduleItemId}
    onChange={e => {
      const selected = schedule.find(s => s.id === e.target.value);
      setNewSale({
        ...newSale,
        scheduleItemId: e.target.value,
        productId: selected?.productId || '',
        accountId: selected?.accountId || ''
      });
    }}
  >
    <option value="">Selecionar Vídeo</option>
    {filteredVideos.map(v => (
      <option key={v.id} value={v.id}>
        {videoDisplayNames[v.id]} - {accounts.find(a => a.id === v.accountId)?.name}
      </option>
    ))}
  </select>
</div>

<div className="space-y-2">
  <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Produto</label>
  <select
    disabled
    className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-4 py-3 text-white outline-none opacity-70"
    value={newSale.productId}
    onChange={() => {}}
  >
    <option value="">Produto vinculado ao vídeo</option>
    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
  </select>
</div>

<div className="space-y-2">
  <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Conta de Origem</label>
  <select
    disabled
    className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl px-4 py-3 text-white outline-none opacity-70"
    value={newSale.accountId}
    onChange={() => {}}
  >
    <option value="">Conta vinculada ao vídeo</option>
    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
  </select>
</div>
            {newSale.scheduleItemId && (() => {
              const selectedItem = schedule.find(s => s.id === newSale.scheduleItemId);
              const linkedTikTokLink = tiktokLinks.find(lnk => lnk.scheduleItemId === newSale.scheduleItemId || lnk.id === selectedItem?.creatorLinkId);

const handle = resolveCreatorHandle(
  selectedItem,
  linkedTikTokLink,
  accounts,
  (selectedItem as any)?._tempCreatorInput || ''
) || null;
              return handle ? (
                <div className="bg-orange-500/10 border border-orange-500/20 text-orange-400 p-3.5 rounded-2xl text-xs flex items-center gap-2">
                  <span className="font-black uppercase bg-orange-500/20 px-2 py-0.5 rounded text-[8px] tracking-widest">Criador</span>
                  <span>Este vídeo está vinculado ao criador <strong>{handle}</strong>.</span>
                </div>
              ) : (
                <div className="bg-[#141414] border border-[#222] p-3.5 rounded-2xl text-xs space-y-2">
                  <p className="text-gray-400 text-[10px] font-black uppercase tracking-wider">Criador Manual</p>
                  <input
                    type="text"
                    placeholder="Adicionar @ do criador (Ex: @maria_dance)"
                    className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl px-3.5 py-2 text-white text-xs outline-none focus:border-orange-500"
                    onChange={e => {
                      const val = e.target.value.trim();
                      if (selectedItem) {
                        (selectedItem as any)._tempCreatorInput = val ? (val.startsWith('@') ? val : '@' + val) : '';
                      }
                    }}
                  />
                </div>
              );
            })()}
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase tracking-widest px-1">Vendas p/ Dia</label>
              <div className="flex bg-[#0a0a0a] border border-[#222] rounded-2xl p-1">
                <button 
                  onClick={() => setNewSale({...newSale, quantity: Math.max(1, newSale.quantity - 1)})}
                  className="w-12 h-12 flex items-center justify-center text-gray-500 hover:text-white"
                >
                  -
                </button>
                <input 
                  type="number"
                  className="flex-1 bg-transparent text-center text-white font-bold outline-none"
                  value={newSale.quantity}
                  onChange={e => setNewSale({...newSale, quantity: parseInt(e.target.value) || 1})}
                />
                <button 
                  onClick={() => setNewSale({...newSale, quantity: newSale.quantity + 1})}
                  className="w-12 h-12 flex items-center justify-center text-gray-500 hover:text-white"
                >
                  +
                </button>
              </div>
            </div>
            <div className="lg:col-span-2 flex items-end">
              <button 
                onClick={handleCreate}
                disabled={!newSale.scheduleItemId || !newSale.productId || !newSale.accountId || isSubmitting}
                className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${
                  !newSale.scheduleItemId || !newSale.productId || !newSale.accountId || isSubmitting
                    ? 'bg-[#1a1a1a] text-gray-600 cursor-not-allowed'
                    : 'bg-white text-black hover:bg-orange-500 hover:shadow-lg hover:shadow-orange-500/20'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full"
                    />
                    Registrando...
                  </>
                ) : (
                  'Confirmar Registro em Massa'
                )}
              </button>
            </div>
          </div>
        </motion.div>
      )}

      <div className="bg-[#141414] border border-[#222] rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-[#222] bg-[#1a1a1a]/30">
          <h4 className="text-white font-bold">Vendas Recentes</h4>
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left min-w-[900px]">
            <thead>
              <tr className="border-b border-[#222] bg-[#1a1a1a]/50">
                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-500">Data</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-500">Produto</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-500">Conta</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-500 text-center">Quant.</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-500 text-right">GMV</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-500 text-right text-green-500">Comissão</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-gray-500 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#222]">
              {sales.sort((a,b) => b.date.localeCompare(a.date)).map(sale => (
                <tr key={sale.id} className="hover:bg-[#1a1a1a] transition-colors group">
                  <td data-label="Data" className="px-6 py-4">
                    <span className="text-sm text-gray-400">{sale.date}</span>
                  </td>
                  <td data-label="Produto" className="px-6 py-4">
                    <div className="flex items-center gap-2">
                       <span className="text-sm font-bold text-white">{products.find(p => p.id === sale.productId)?.name || 'Removido'}</span>
                    </div>
                  </td>
                  <td data-label="Conta" className="px-6 py-4">
                    <div className="flex items-center gap-2">
                       <Monitor className="w-3 h-3 text-gray-500" />
                       <span className="text-sm text-gray-400">{accounts.find(a => a.id === sale.accountId)?.name || 'Removido'}</span>
                    </div>
                  </td>
                  <td data-label="Quantidade" className="px-6 py-4 text-center">
                    <span className="text-sm font-mono text-white">{sale.quantity}</span>
                  </td>
                  <td data-label="GMV" className="px-6 py-4 text-right">
                    <span className="text-sm font-mono text-white">
                      <ProtectedValue prefix="R$ " value={sale.gmv.toFixed(2)} />
                    </span>
                  </td>
                  <td data-label="Comissao" className="px-6 py-4 text-right">
                    <span className="text-sm font-mono text-green-500 font-bold">
                      <ProtectedValue prefix="R$ " value={sale.commission.toFixed(2)} />
                    </span>
                  </td>
                  <td data-label="Acoes" className="px-6 py-4 text-right">
                    <button 
                      onClick={() => handleDelete(sale.id)}
                      className="p-2 text-gray-600 hover:text-red-500 transition-colors md:opacity-0 md:group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500 italic">Nenhuma venda registrada ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ReadyVideosManager({ schedule, accounts, products, producers }: { schedule: ScheduleItem[], accounts: Account[], products: Product[], producers: Producer[] }) {
  const readyItems = useMemo(() => {
    return schedule.filter(s => s.status === ScheduleStatus.PRODUCED || s.status === ScheduleStatus.POSTED);
  }, [schedule]);

  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  const getGoogleDriveId = (url: string): string | null => {
    if (!url) return null;
    const matchD = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (matchD) return matchD[1];
    const matchId = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (matchId) return matchId[1];
    return null;
  };

  const handleDownload = async (fileUrl: string, fileName: string) => {
    const driveId = getGoogleDriveId(fileUrl);
    if (driveId) {
      setDownloadingFile(fileUrl);
      try {
        // Trigger seamless direct download utilizing custom server endpoint
        window.location.href = `/api/drive/download?fileId=${driveId}`;
      } catch (err) {
        console.error("Direct download stream error:", err);
        alert("Erro no download nativo. Abrindo link em nova aba.");
        window.open(fileUrl, '_blank');
      } finally {
        setTimeout(() => setDownloadingFile(null), 2500);
      }
    } else {
      window.open(fileUrl, '_blank');
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <FileVideo className="w-6 h-6 text-orange-500 animate-pulse" />
          Publicações
        </h3>
        <p className="text-sm text-gray-500">Acompanhe vídeos prontos para postagem e publicações já postadas.</p>
      </div>

      {readyItems.length === 0 ? (
        <div className="bg-[#141414] border border-[#222] rounded-3xl p-16 text-center space-y-4">
          <div className="w-12 h-12 bg-[#1a1a1a] rounded-full flex items-center justify-center mx-auto text-gray-600">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <p className="text-white font-black text-sm uppercase tracking-wider">Tudo em ordem!</p>
            <p className="text-gray-500 text-xs text-center">Nenhuma publicação ou vídeo pronto no momento.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {readyItems.map(item => {
            const acc = accounts.find(a => a.id === item.accountId);
            const prod = products.find(p => p.id === item.productId);
            const editor = producers.find(p => p.id === item.producerId);
            const videosList = normalizeFileList(item.finishedVideoUrl);

            return (
              <motion.div 
                key={item.id}
                layout
                className="bg-[#141414] border border-[#222] rounded-3xl p-6 flex flex-col justify-between space-y-6 relative overflow-hidden group hover:border-[#333] transition-colors"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[10px] uppercase font-black tracking-widest px-2.5 py-1 rounded-lg">
                        {acc?.name || 'Sem Conta'}
                      </span>
                      <span className={`text-[10px] uppercase font-black tracking-widest px-2.5 py-1 rounded-lg border ${item.status === ScheduleStatus.POSTED ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                        {item.status === ScheduleStatus.POSTED ? 'Postado' : 'Pronto'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-gray-500 font-bold bg-[#0a0a0a] border border-[#1e1e1e] p-1.5 rounded-lg">
                      Lote: {item.date.split('-').reverse().slice(0, 2).join('/')} n° {item.dailyIndex || '001'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h4 className="text-white text-base font-bold truncate">{prod?.name || 'Produto Não Vinculado'}</h4>
                    <p className="text-xs text-gray-400">Editado por: <strong className="text-gray-300 font-semibold">{editor?.name || 'Editor Geral'}</strong></p>
                  </div>

                  {item.productionNotes && (
                    <div className="bg-[#0a0a0a] border border-[#222] p-3.5 rounded-2xl text-xs text-gray-400 leading-relaxed italic">
                      "{item.productionNotes}"
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-4 border-t border-[#1e1e1e]">
                  {videosList.length === 0 ? (
                    item.status === ScheduleStatus.POSTED && item.videoLink ? (
                      <button
                        onClick={() => window.open(item.videoLink, '_blank')}
                        className="w-full bg-green-500 hover:bg-green-400 text-black py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Abrir Publicação
                      </button>
                    ) : (
                      <p className="text-xs text-red-500 italic">Nenhum arquivo de vídeo anexado por enquanto.</p>
                    )
                  ) : (
                    videosList.map((file: any, fIdx) => {
                      const url = typeof file === 'string' ? file : file.url;
                      const name = typeof file === 'string' ? `Video pronto #${fIdx + 1}` : (file.name || `Video pronto #${fIdx + 1}`);
                      return (
                        <button
                          key={fIdx}
                          onClick={() => handleDownload(url, name)}
                          disabled={downloadingFile === url}
                          className="w-full bg-white hover:bg-gray-100 text-black py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-white/5 active:scale-95 disabled:opacity-50 disabled:cursor-wait"
                        >
                          <Download className="w-4 h-4" />
                          {downloadingFile === url ? 'Baixando Arquivo...' : 'Fazer Download Direto'}
                        </button>
                      );
                    })
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreatorsManager({ sales, tiktokLinks, schedule, products, accounts, isPartner, ProtectedValue }: { sales: Sale[], tiktokLinks: TiktokLink[], schedule: ScheduleItem[], products: Product[], accounts: Account[], isPartner: boolean, ProtectedValue: any }) {
  const [search, setSearch] = useState('');
  const [selectedCreator, setSelectedCreator] = useState<any | null>(null);

const creators = useMemo(() => {
  const registry: Record<string, {
    handle: string,
    links: Array<any>,
    sales: Array<Sale>
  }> = {};

  tiktokLinks.forEach(lnk => {
    const handle = normalizeCreatorHandle(
      lnk.creatorHandle ||
      extractTiktokUsername(lnk.link)
    );

    if (!handle) return;
    if (isOperationalCreatorHandle(handle, accounts)) return;

    const clean = handle;

    if (!registry[clean]) {
      registry[clean] = {
        handle: clean,
        links: [],
        sales: []
      };
    }

    registry[clean].links.push(lnk);
  });

  sales.forEach(sale => {
    const linkedSchedule = schedule.find(
      s => s.id === (sale as any).scheduleItemId
    );

    const linkedTikTokLink = tiktokLinks.find(
      lnk => lnk.scheduleItemId === (sale as any).scheduleItemId || lnk.id === linkedSchedule?.creatorLinkId
    );

    const saleHandle = normalizeCreatorHandle((sale as any).creatorHandle || '');
    const handle = saleHandle && !isOperationalCreatorHandle(saleHandle, accounts) ? saleHandle : resolveCreatorHandle(
      linkedSchedule,
      linkedTikTokLink,
      accounts,
      ''
    );

    if (!handle) return;

    const clean = normalizeCreatorHandle(handle);

    if (!registry[clean]) {
      registry[clean] = {
        handle: clean,
        links: [],
        sales: []
      };
    }

    registry[clean].sales.push(sale);
  });

  return Object.values(registry).map(c => {
    const gmvSum = c.sales.reduce(
      (sum, s) => sum + (s.gmv || 0),
      0
    );

    const commSum = c.sales.reduce(
      (sum, s) => sum + (s.commission || 0),
      0
    );

    const qtySum = c.sales.reduce(
      (sum, s) => sum + (s.quantity || 0),
      0
    );

    return {
      handle: c.handle,
      linksCount: c.links.length,
      salesCount: c.sales.length,
      totalGmv: gmvSum,
      totalCommission: commSum,
      totalQty: qtySum,
      links: c.links,
      salesList: c.sales
    };
  }).sort((a, b) => b.totalGmv - a.totalGmv);

}, [sales, tiktokLinks, schedule, accounts]);

  const filteredCreators = useMemo(() => {
    return creators.filter(c => c.handle.toLowerCase().includes(search.toLowerCase()));
  }, [creators, search]);

  const totalGmv = creators.reduce((sum, c) => sum + c.totalGmv, 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <UsersIcon className="w-6 h-6 text-orange-500" />
            Painel de Criadores
          </h3>
          <p className="text-sm text-gray-500">Monitore as publicações dos influenciadores, identifique o criador da venda e acompanhe métricas consolidadas.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-4 top-3.5 w-4 h-4 text-gray-500" />
            <input 
              type="text"
              placeholder="Buscar criador por @username..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#141414] border border-[#222] rounded-2xl pl-12 pr-4 py-3 text-sm text-white placeholder-gray-500 outline-none focus:border-orange-500 transition-colors"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#141414] border border-[#222] p-5 rounded-3xl space-y-1.5">
          <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Total de Criadores</p>
          <p className="text-2xl font-black text-white">{creators.length}</p>
        </div>
        <div className="bg-[#141414] border border-[#222] p-5 rounded-3xl space-y-1.5">
          <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Vídeos Vinculados</p>
          <p className="text-2xl font-black text-white">{creators.reduce((sum, c) => sum + c.linksCount, 0)}</p>
        </div>
        <div className="bg-[#141414] border border-[#222] p-5 rounded-3xl space-y-1.5">
          <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Vendas Registradas</p>
          <p className="text-2xl font-black text-green-500">{creators.reduce((sum, c) => sum + c.totalQty, 0)}</p>
        </div>
        <div className="bg-[#141414] border border-[#222] p-5 rounded-3xl space-y-1.5">
          <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">GMV via Criadores</p>
          <p className="text-2xl font-black text-white font-mono">
            <ProtectedValue prefix="R$ " value={totalGmv.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
          </p>
        </div>
      </div>

      <div className="bg-[#141414] border border-[#222] rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-[#0a0a0a] text-gray-500 text-[10px] font-black uppercase tracking-widest border-b border-[#222]">
              <tr>
                <th className="px-6 py-4">Criador</th>
                <th className="px-6 py-4">Vídeos Ativos</th>
                <th className="px-6 py-4">Qtd Vendas</th>
                <th className="px-6 py-4">GMV Gerado</th>
                <th className="px-6 py-4">Comissão Proprietário</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#222]">
              {filteredCreators.map(creator => (
                <tr key={creator.handle} className="hover:bg-[#1c1c1c]/40 transition-colors">
                  <td data-label="Criador" className="px-6 py-5">
                    <a 
                      href={`https://www.tiktok.com/${creator.handle}`} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="text-white font-extrabold hover:text-orange-400 font-mono transition-colors flex items-center gap-1.5"
                    >
                      {creator.handle}
                      <ExternalLink className="w-3 h-3 text-gray-600" />
                    </a>
                  </td>
                  <td data-label="Videos Ativos" className="px-6 py-5 font-mono text-gray-400">
                    {creator.linksCount}
                  </td>
                  <td data-label="Qtd Vendas" className="px-6 py-5 font-bold font-mono text-emerald-500">
                    {creator.totalQty}
                  </td>
                  <td data-label="GMV Gerado" className="px-6 py-5 font-bold font-mono text-white">
                    <ProtectedValue prefix="R$ " value={creator.totalGmv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} />
                  </td>
                  <td data-label="Comissao Proprietario" className="px-6 py-5 font-bold font-mono text-gray-400">
                    <ProtectedValue prefix="R$ " value={creator.totalCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} />
                  </td>
                  <td data-label="Acoes" className="px-6 py-5 text-right">
                    <button
                      onClick={() => setSelectedCreator(selectedCreator?.handle === creator.handle ? null : creator)}
                      className="text-xs bg-[#222] hover:bg-[#333] text-gray-300 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer font-bold uppercase tracking-wider"
                    >
                      {selectedCreator?.handle === creator.handle ? 'Fechar' : 'Ver Detalhes'}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredCreators.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500 text-xs italic">
                    Nenhum criador encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {selectedCreator && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="bg-[#141414] border border-[#222] rounded-3xl p-6 space-y-6"
          >
            <div className="flex items-center justify-between pb-4 border-b border-[#222]">
              <div className="space-y-0.5">
                <h4 className="text-white text-base font-extrabold font-mono">{selectedCreator.handle}</h4>
                <p className="text-xs text-gray-500">Histórico de publicações e vendas deste influenciador.</p>
              </div>
              <button 
                onClick={() => setSelectedCreator(null)}
                className="p-1.5 hover:bg-[#222] rounded-xl text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Links list */}
              <div className="space-y-3">
                <p className="text-gray-400 text-xs font-black uppercase tracking-wider">Links de Vídeo Ativos ({selectedCreator.linksCount})</p>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 no-scrollbar flex flex-col gap-2">
                  {selectedCreator.links.map((link: any, idx: number) => (
                    <a 
                      key={link.id || idx}
                      href={link.link}
                      target="_blank"
                      rel="noreferrer"
                      className="block p-3.5 bg-[#0a0a0a] border border-[#1e1e1e] hover:border-gray-500 rounded-2xl hover:bg-black/50 transition-all group"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white truncate max-w-xs">{link.link}</span>
                        <ArrowUpRight className="w-4 h-4 text-gray-600 group-hover:text-orange-500 transition-colors flex-shrink-0" />
                      </div>
                      {link.createdAt && (
                        <p className="text-[10px] text-gray-500 mt-1 font-mono">
                          Registrado em: {new Date(link.createdAt?.seconds ? link.createdAt.seconds * 1000 : link.createdAt).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </a>
                  ))}
                  {selectedCreator.linksCount === 0 && (
                    <p className="text-xs text-gray-600 italic">Nenhum link registrado explicitamente para este criador.</p>
                  )}
                </div>
              </div>

              {/* Sales List */}
              <div className="space-y-3">
                <p className="text-gray-400 text-xs font-black uppercase tracking-wider">Histórico de Vendas ({selectedCreator.salesCount})</p>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 no-scrollbar flex flex-col gap-2">
                  {selectedCreator.salesList.map((sale: Sale, idx: number) => {
                    const prodName = products.find(p => p.id === sale.productId)?.name || 'Produto Removido';
                    const accName = accounts.find(a => a.id === sale.accountId)?.name || 'Conta Removida';
                    return (
                      <div key={sale.id || idx} className="p-3.5 bg-[#0a0a0a] border border-[#1e1e1e] rounded-2xl flex items-center justify-between gap-4 text-xs">
                        <div>
                          <p className="text-white font-extrabold">{prodName}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{sale.date} • {accName}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-green-500 font-extrabold font-mono">R$ {sale.gmv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{sale.quantity}x unidades</p>
                        </div>
                      </div>
                    );
                  })}
                  {selectedCreator.salesCount === 0 && (
                    <p className="text-xs text-gray-600 italic">Nenhuma venda de afiliado vinculada até o momento.</p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
