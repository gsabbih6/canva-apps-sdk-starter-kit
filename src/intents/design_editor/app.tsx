import React, { useState, useEffect } from 'react';
import { AppUiProvider } from '@canva/app-ui-kit';
import { addElementAtCursor, addElementAtPoint } from "@canva/design";
import { useFeatureSupport } from "@canva/app-hooks";
import { QrCode, AlertCircle, CheckCircle2, Wallet, DollarSign, Link as LinkIcon, Key, LogOut, FileText, User, Mail } from 'lucide-react';
import QRCode from 'qrcode';
import * as styles from "../../../styles/components.css";

// Production XRPay API
const API_BASE_URL = 'https://xrpay.xbitinnovations.com/api'; 

export const App = () => {
  const isSupported = useFeatureSupport();
  const addElement = [addElementAtPoint, addElementAtCursor].find((fn) =>
    isSupported(fn),
  );

  // Core State
  const [activeTab, setActiveTab] = useState<'guest' | 'connected'>('guest');
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [integrationKey, setIntegrationKey] = useState('');
  const [invoiceLabel, setInvoiceLabel] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  
  // Connection State
  const [isConnected, setIsConnected] = useState(false);
  const [merchantData, setMerchantData] = useState<any>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Status State
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<string | null>(null);

  // Restore saved connection
  useEffect(() => {
    const savedKey = localStorage.getItem('xrpay_integration_token');
    if (savedKey) {
      setIntegrationKey(savedKey);
      setActiveTab('connected');
      handleConnect(savedKey);
    }
  }, []);

  const handleConnect = async (tokenOverride?: string) => {
    const token = tokenOverride || integrationKey;
    if (!token) return;

    setIsConnecting(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE_URL}/canva/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrationToken: token })
      });

      const data = await res.json();
      
      if (data.success) {
        setIsConnected(true);
        setMerchantData(data.merchant);
        localStorage.setItem('xrpay_integration_token', token);
      } else {
        setError(data.error || 'Failed to connect. Check your Integration Key.');
        setIsConnected(false);
        setMerchantData(null);
        localStorage.removeItem('xrpay_integration_token');
      }
    } catch (e) {
      setError('Cannot reach XRPay. Check your network connection.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setMerchantData(null);
    setIntegrationKey('');
    setLastInvoice(null);
    localStorage.removeItem('xrpay_integration_token');
    setError('');
  };

  // Brand the QR with XRPay logo center
  const generateBrandedImageBytes = async (qrDataUrl: string): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(qrDataUrl);

      const qrImage = new Image();
      qrImage.onload = () => {
        ctx.drawImage(qrImage, 0, 0, 400, 400);

        ctx.beginPath();
        ctx.arc(200, 200, 44, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" fill="none">
          <defs>
            <linearGradient id="bgG" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#23292F" />
              <stop offset="100%" stop-color="#222222" />
            </linearGradient>
            <linearGradient id="purp" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#00A2FF" />
              <stop offset="100%" stop-color="#0072FF" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="40" fill="url(#bgG)" />
          <circle cx="60" cy="60" r="25" fill="#FFFFFF" />
          <circle cx="60" cy="60" r="12" fill="url(#purp)" />
          <circle cx="60" cy="60" r="50" fill="none" stroke="url(#bgG)" stroke-width="3" stroke-dasharray="10 6" opacity="0.6" />
        </svg>`;
        const logoImage = new Image();
        logoImage.onload = () => {
          ctx.drawImage(logoImage, 160, 160, 80, 80);
          resolve(canvas.toDataURL('image/png'));
        };
        logoImage.onerror = () => resolve(qrDataUrl);
        logoImage.src = `data:image/svg+xml;base64,${btoa(logoSvg)}`;
      };
      qrImage.onerror = reject;
      qrImage.src = qrDataUrl;
    });
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLastInvoice(null);

    if (!addElement) {
      setError('Adding elements is not supported in this view.');
      return;
    }

    setIsGenerating(true);

    try {
      let finalUri = '';

      if (activeTab === 'guest') {
        // GUEST MODE: Offline Xaman link
        if (!address || !address.startsWith('r')) {
          throw new Error('Valid XRP destination address is required.');
        }
        finalUri = `https://xaman.app/detect/request:${address}`;
        if (amount && !isNaN(Number(amount))) finalUri += `?amount=${amount}`;
      } else {
        // PRO SYNC: API call creates Invoice + Transaction
        if (!isConnected) throw new Error('Not connected to XRPay.');
        if (!amount) throw new Error('Amount is required for tracked invoices.');
        
        const res = await fetch(`${API_BASE_URL}/canva/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            integrationToken: integrationKey,
            amount: amount,
            label: invoiceLabel || "Canva Design Invoice",
            customerName: customerName || undefined,
            customerEmail: customerEmail || undefined,
          })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        
        finalUri = data.checkoutUrl;
        if (data.invoiceNumber) {
          setLastInvoice(data.invoiceNumber);
        }
      }

      // Generate QR
      const qrDataUrl = await QRCode.toDataURL(finalUri, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 400,
        color: { dark: '#000000', light: '#ffffff' }
      });

      // Brand it
      const brandedImage = await generateBrandedImageBytes(qrDataUrl);

      // Insert into design
      await addElement({
        type: 'image',
        dataUrl: brandedImage,
        altText: undefined
      });
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
      
    } catch (e: any) {
      setError(e.message || 'Failed to generate QR Code');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <AppUiProvider>
      <div className={styles.scrollContainer} style={{ padding: '24px 20px', backgroundColor: 'var(--color-surface)', height: '100vh' }}>
        
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 600, margin: '0 0 6px 0', lineHeight: 1.3, color: 'var(--color-text-main)' }}>XRPay</h1>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: 0 }}>
            Generate instant XRP payment codes.
          </p>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', backgroundColor: '#F1F5F9', padding: '4px', borderRadius: '8px' }}>
          <button 
            onClick={() => { setActiveTab('guest'); setError(''); }}
            style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
              backgroundColor: activeTab === 'guest' ? 'white' : 'transparent',
              boxShadow: activeTab === 'guest' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              color: activeTab === 'guest' ? '#0F172A' : '#64748B'
            }}>
            Quick Code
          </button>
          <button 
            onClick={() => { setActiveTab('connected'); setError(''); }}
            style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
              backgroundColor: activeTab === 'connected' ? 'white' : 'transparent',
              boxShadow: activeTab === 'connected' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              color: activeTab === 'connected' ? '#0072FF' : '#64748B',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
            }}>
            <LinkIcon size={14} /> Pro Sync
          </button>
        </div>

        {/* Dynamic Content Views */}
        {activeTab === 'guest' ? (
          // --- GUEST VIEW ---
          <form id="generateForm" onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-main)' }}>Destination Address</label>
                <div style={{ position: 'relative' }}>
                  <Wallet size={16} color="var(--color-text-muted)" style={{ position: 'absolute', top: '12px', left: '12px' }} />
                  <input
                    type="text"
                    className={styles['input-field']}
                    placeholder="rXRPay..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px 10px 36px', fontSize: '14px', borderRadius: '8px', border: '1px solid var(--color-border)' }}
                  />
                </div>
              </div>
          </form>
        ) : (
          // --- PRO SYNC VIEW ---
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {!isConnected ? (
              // Connection Form
              <div style={{ backgroundColor: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <h3 style={{ fontSize: '14px', margin: '0 0 8px 0', color: '#0F172A' }}>Link your XRPay Dashboard</h3>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 16px 0', lineHeight: 1.4 }}>
                  Paste your <strong>Integration Key</strong> from <em>Dashboard → Integrations → Canva</em> to create tracked invoices.
                </p>
                <div style={{ position: 'relative', marginBottom: '12px' }}>
                  <Key size={16} color="var(--color-text-muted)" style={{ position: 'absolute', top: '12px', left: '12px' }} />
                  <input
                    type="password"
                    placeholder="Paste Integration Key"
                    value={integrationKey}
                    onChange={(e) => setIntegrationKey(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px 10px 36px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--color-border)' }}
                  />
                </div>
                <button 
                  onClick={() => handleConnect()}
                  disabled={!integrationKey || isConnecting}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#0072FF', color: 'white', border: 'none', fontWeight: 500, cursor: 'pointer', opacity: (!integrationKey || isConnecting) ? 0.6 : 1 }}
                >
                  {isConnecting ? "Connecting..." : "Connect"}
                </button>
              </div>
            ) : (
              // Connected Status
              <>
                <div style={{ backgroundColor: '#EFF6FF', padding: '16px', borderRadius: '12px', border: '1px solid #BFDBFE' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle2 size={16} color="#2563EB" />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#1E3A8A' }}>Connected</span>
                     </div>
                     <button onClick={handleDisconnect} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                       <LogOut size={14} /> Disconnect
                     </button>
                  </div>
                  <p style={{ fontSize: '14px', margin: 0, fontWeight: 600, color: '#1E40AF' }}>{merchantData?.name}</p>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#3B82F6', backgroundColor: '#DBEAFE', padding: '2px 8px', borderRadius: '4px', fontWeight: 500 }}>
                      {merchantData?.currency}
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '180px' }}>
                      {merchantData?.settlementAddress}
                    </span>
                  </div>
                </div>

                {/* Optional Invoice Details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ position: 'relative' }}>
                    <FileText size={14} color="var(--color-text-muted)" style={{ position: 'absolute', top: '11px', left: '10px' }} />
                    <input
                      type="text"
                      placeholder="Invoice label (optional)"
                      value={invoiceLabel}
                      onChange={(e) => setInvoiceLabel(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '9px 10px 9px 32px', fontSize: '13px', borderRadius: '6px', border: '1px solid #E2E8F0' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <User size={14} color="var(--color-text-muted)" style={{ position: 'absolute', top: '11px', left: '10px' }} />
                      <input
                        type="text"
                        placeholder="Customer name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 10px 9px 32px', fontSize: '13px', borderRadius: '6px', border: '1px solid #E2E8F0' }}
                      />
                    </div>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <Mail size={14} color="var(--color-text-muted)" style={{ position: 'absolute', top: '11px', left: '10px' }} />
                      <input
                        type="text"
                        placeholder="Email"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 10px 9px 32px', fontSize: '13px', borderRadius: '6px', border: '1px solid #E2E8F0' }}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* SHARED AMOUNT + SUBMIT */}
        { (activeTab === 'guest' || isConnected) && (
          <form id="generateForm" onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-main)' }}>
                Amount <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>{activeTab === 'guest' ? '(Optional)' : `(${merchantData?.fiatCurrency || 'USD'})`}</span>
              </label>
              <div style={{ position: 'relative' }}>
                 <DollarSign size={16} color="var(--color-text-muted)" style={{ position: 'absolute', top: '12px', left: '12px' }} />
                <input
                  type="number"
                  step="any"
                  min="0"
                  className={styles['input-field']}
                  placeholder={isConnected ? "Invoice amount" : "100.00"}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px 10px 36px', fontSize: '14px', borderRadius: '8px', border: '1px solid var(--color-border)' }}
                />
              </div>
            </div>

            {error && (
              <div style={{ fontSize: '12px', color: 'var(--color-error)', display: 'flex', alignItems: 'flex-start', gap: '6px', backgroundColor: '#FEF2F2', padding: '10px', borderRadius: '6px' }}>
                 <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                 <span>{error}</span>
              </div>
            )}

            {/* Last invoice confirmation */}
            {lastInvoice && success && (
              <div style={{ fontSize: '12px', color: '#059669', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#ECFDF5', padding: '10px', borderRadius: '6px' }}>
                <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
                <span><strong>{lastInvoice}</strong> created and synced to your Dashboard.</span>
              </div>
            )}

            <button 
              type="submit" 
              disabled={isGenerating || !addElement || (activeTab === 'connected' && !amount)}
              style={{ 
                width: '100%', padding: '14px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                backgroundColor: success ? '#F8FAFC' : '#0F172A',
                color: success ? '#0F172A' : 'white',
                border: success ? '1px solid #E2E8F0' : 'none',
                transition: 'all 0.2s', marginTop: '8px',
                opacity: (isGenerating || !addElement || (activeTab === 'connected' && !amount)) ? 0.6 : 1,
              }}
            >
              {isGenerating ? 'Generating...' : success ? '✓ Added to Canvas' : activeTab === 'connected' ? 'Generate Invoice QR' : 'Generate Guest QR'}
            </button>
            
            {activeTab === 'connected' && isConnected && !success && (
              <div style={{ fontSize: '11px', textAlign: 'center', color: '#64748B', marginTop: '-8px' }}>
                Creates a tracked invoice in your XRPay Dashboard.
              </div>
            )}
          </form>
        )}

      </div>
    </AppUiProvider>
  );
};
