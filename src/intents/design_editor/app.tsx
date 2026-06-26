import React, { useState, useEffect } from 'react';
import { 
  Button, 
  FormField, 
  TextInput, 
  Rows, 
  Text, 
  Title, 
  Tabs, 
  TabList, 
  Tab, 
  TabPanels, 
  TabPanel
} from '@canva/app-ui-kit';
import { addElementAtCursor, addElementAtPoint } from "@canva/design";
import { useFeatureSupport } from "@canva/app-hooks";
import { AlertCircle, CheckCircle2, Wallet, DollarSign, Link as LinkIcon, Key, FileText, User, Mail } from 'lucide-react';
import QRCode from 'qrcode';
import * as styles from "../../../styles/components.css";
import { FormattedMessage, useIntl } from 'react-intl';

// Production XRPay API
const API_BASE_URL = 'https://xrpay.xbitinnovations.com/api'; 

interface MerchantData {
  name: string;
  currency: string;
  fiatCurrency?: string;
  settlementAddress?: string;
}

export const App = () => {
  const isSupported = useFeatureSupport();
  const addElement = [addElementAtPoint, addElementAtCursor].find((fn) =>
    isSupported(fn),
  );

  const intl = useIntl();

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
  const [merchantData, setMerchantData] = useState<MerchantData | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Status State
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<string | null>(null);



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
        setError(data.error || intl.formatMessage({
          defaultMessage: 'Failed to connect. Check your Integration Key.',
          description: 'Error message when integration key connection fails'
        }));
        setIsConnected(false);
        setMerchantData(null);
        localStorage.removeItem('xrpay_integration_token');
      }
    } catch {
      setError(intl.formatMessage({
        defaultMessage: 'Cannot reach XRPay. Check your network connection.',
        description: 'Error message when backend is unreachable'
      }));
    } finally {
      setIsConnecting(false);
    }
  };

  // Restore saved connection
  useEffect(() => {
    const savedKey = localStorage.getItem('xrpay_integration_token');
    if (savedKey) {
      setIntegrationKey(savedKey);
      setActiveTab('connected');
      handleConnect(savedKey);
    }
  }, []);

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
      setError(intl.formatMessage({
        defaultMessage: 'Adding elements is not supported in this view.',
        description: 'Error message when addElement is not available'
      }));
      return;
    }

    setIsGenerating(true);

    try {
      let finalUri = '';

      if (activeTab === 'guest') {
        // GUEST MODE: Offline Xaman link
        if (!address || !address.startsWith('r')) {
          throw new Error(intl.formatMessage({
            defaultMessage: 'Valid XRP destination address is required.',
            description: 'Validation error for XRP destination address'
          }));
        }
        finalUri = `https://xaman.app/detect/request:${address}`;
        if (amount && !isNaN(Number(amount))) finalUri += `?amount=${amount}`;
      } else {
        // PRO SYNC: API call creates Invoice + Transaction
        if (!isConnected) {
          throw new Error(intl.formatMessage({
            defaultMessage: 'Not connected to XRPay.',
            description: 'Validation error when not connected to dashboard'
          }));
        }
        if (!amount) {
          throw new Error(intl.formatMessage({
            defaultMessage: 'Amount is required for tracked invoices.',
            description: 'Validation error when amount is empty in pro sync'
          }));
        }
        
        const res = await fetch(`${API_BASE_URL}/canva/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            integrationToken: integrationKey,
            amount,
            label: invoiceLabel || intl.formatMessage({
              defaultMessage: 'Canva Design Invoice',
              description: 'Default label for invoices generated from Canva'
            }),
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
      
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : intl.formatMessage({
        defaultMessage: 'Failed to generate QR Code',
        description: 'Default fallback error for QR generation failure'
      });
      setError(errMsg);
    } finally {
      setIsGenerating(false);
    }
  };

  const amountLabel = activeTab === 'guest'
    ? intl.formatMessage({
        defaultMessage: 'Amount (Optional)',
        description: 'Label for optional amount field in guest mode'
      })
    : intl.formatMessage(
        {
          defaultMessage: 'Amount ({currency})',
          description: 'Label for amount field with currency symbol in pro mode'
        },
        { currency: merchantData?.fiatCurrency || 'USD' }
      );

  return (
    <div className={styles.scrollContainer} style={{ padding: '24px 20px', backgroundColor: 'var(--color-surface)', height: '100vh' }}>
      <Rows spacing="3u">
        {/* Header */}
        <Rows spacing="0.5u">
          <Title size="medium">
            <FormattedMessage
              defaultMessage="XRPay"
              description="Application title"
            />
          </Title>
          <Text tone="secondary" size="small">
            <FormattedMessage
              defaultMessage="Generate instant XRP payment codes."
              description="Application description subtext"
            />
          </Text>
        </Rows>

        {/* Tab Navigation */}
        <Tabs activeId={activeTab} onSelect={(id) => { setActiveTab(id as 'guest' | 'connected'); setError(''); }}>
          <TabList align="stretch" spacing="1u">
            <Tab id="guest">
              <FormattedMessage
                defaultMessage="Quick Code"
                description="Tab label for guest mode"
              />
            </Tab>
            <Tab id="connected" start={<LinkIcon size={14} />}>
              <FormattedMessage
                defaultMessage="Pro Sync"
                description="Tab label for merchant sync mode"
              />
            </Tab>
          </TabList>
          
          <TabPanels>
            <TabPanel id="guest">
              <div style={{ marginTop: '20px' }}>
                <FormField
                  label={intl.formatMessage({
                    defaultMessage: 'Destination Address',
                    description: 'Label for XRP target wallet address'
                  })}
                  value={address}
                  control={(props) => (
                    <TextInput
                      {...props}
                      start={<Wallet size={16} />}
                      placeholder={intl.formatMessage({
                        defaultMessage: 'rXRPay...',
                        description: 'Placeholder for XRP wallet address input'
                      })}
                      value={address}
                      onChange={(val) => setAddress(val)}
                    />
                  )}
                />
              </div>
            </TabPanel>
            
            <TabPanel id="connected">
              <div style={{ marginTop: '20px' }}>
                {!isConnected ? (
                  <Rows spacing="2u">
                    <Rows spacing="1u">
                      <Title size="xsmall">
                        <FormattedMessage
                          defaultMessage="Link your XRPay Dashboard"
                          description="Dashboard linking header"
                        />
                      </Title>
                      <Text tone="secondary" size="small">
                        <FormattedMessage
                          defaultMessage="Paste your Integration Key from Dashboard → Integrations → Canva to create tracked invoices."
                          description="Link dashboard instructions"
                        />
                      </Text>
                    </Rows>
                    
                    <FormField
                      label={intl.formatMessage({
                        defaultMessage: 'Integration Key',
                        description: 'Label for dashboard api integration key'
                      })}
                      value={integrationKey}
                      control={(props) => (
                        <TextInput
                          {...props}
                          start={<Key size={16} />}
                          placeholder={intl.formatMessage({
                            defaultMessage: 'Paste Integration Key',
                            description: 'Placeholder for integration key input'
                          })}
                          value={integrationKey}
                          onChange={(val) => setIntegrationKey(val)}
                        />
                      )}
                    />
                    
                    <Button 
                      variant="primary"
                      onClick={() => handleConnect()}
                      disabled={!integrationKey || isConnecting}
                      loading={isConnecting}
                      stretch
                    >
                      {intl.formatMessage({
                        defaultMessage: "Connect",
                        description: "Button label to authenticate"
                      })}
                    </Button>
                  </Rows>
                ) : (
                  <Rows spacing="2u">
                    <div style={{ backgroundColor: '#EFF6FF', padding: '16px', borderRadius: '12px', border: '1px solid #BFDBFE' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CheckCircle2 size={16} color="#2563EB" />
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#1E3A8A' }}>
                            <FormattedMessage
                              defaultMessage="Connected"
                              description="Status indicator label"
                            />
                          </span>
                        </div>
                        <Button 
                          variant="secondary" 
                          onClick={handleDisconnect}
                        >
                          {intl.formatMessage({
                            defaultMessage: "Disconnect",
                            description: "Unlink button label"
                          })}
                        </Button>
                      </div>
                      
                      <div style={{ color: '#1E40AF', fontWeight: 'bold' }}>
                        {merchantData?.name}
                      </div>
                      
                      <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#3B82F6', backgroundColor: '#DBEAFE', padding: '2px 8px', borderRadius: '4px', fontWeight: 500 }}>
                          {merchantData?.currency}
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '180px' }}>
                          {merchantData?.settlementAddress}
                        </span>
                      </div>
                    </div>

                    <FormField
                      label={intl.formatMessage({
                        defaultMessage: 'Invoice Label (Optional)',
                        description: 'Label for optional custom invoice tag'
                      })}
                      value={invoiceLabel}
                      control={(props) => (
                        <TextInput
                          {...props}
                          start={<FileText size={16} />}
                          placeholder={intl.formatMessage({
                            defaultMessage: 'Invoice label (optional)',
                            description: 'Placeholder for optional custom invoice tag'
                          })}
                          value={invoiceLabel}
                          onChange={(val) => setInvoiceLabel(val)}
                        />
                      )}
                    />
                    
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <FormField
                          label={intl.formatMessage({
                            defaultMessage: 'Customer Name',
                            description: 'Label for buyer name field'
                          })}
                          value={customerName}
                          control={(props) => (
                            <TextInput
                              {...props}
                              start={<User size={16} />}
                              placeholder={intl.formatMessage({
                                defaultMessage: 'Customer name',
                                description: 'Placeholder for customer name input'
                              })}
                              value={customerName}
                              onChange={(val) => setCustomerName(val)}
                            />
                          )}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <FormField
                          label={intl.formatMessage({
                            defaultMessage: 'Email',
                            description: 'Label for customer email address'
                          })}
                          value={customerEmail}
                          control={(props) => (
                            <TextInput
                              {...props}
                              start={<Mail size={16} />}
                              placeholder={intl.formatMessage({
                                defaultMessage: 'Email',
                                description: 'Placeholder for customer email input'
                              })}
                              value={customerEmail}
                              onChange={(val) => setCustomerEmail(val)}
                            />
                          )}
                        />
                      </div>
                    </div>
                  </Rows>
                )}
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>

        {/* Amount Input and Actions */}
        {(activeTab === 'guest' || isConnected) && (
          <Rows spacing="2u">
            <FormField
              label={amountLabel}
              value={amount}
              control={(props) => (
                <TextInput
                  {...props}
                  start={<DollarSign size={16} />}
                  placeholder={
                    activeTab === 'connected' 
                      ? intl.formatMessage({
                          defaultMessage: 'Invoice amount',
                          description: 'Placeholder for numeric invoice total'
                        })
                      : intl.formatMessage({
                          defaultMessage: '100.00',
                          description: 'Placeholder for guest amount input'
                        })
                  }
                  value={amount}
                  onChange={(val) => setAmount(val)}
                />
              )}
            />

            {error && (
              <div style={{ fontSize: '12px', color: 'var(--color-error)', display: 'flex', alignItems: 'flex-start', gap: '6px', backgroundColor: '#FEF2F2', padding: '10px', borderRadius: '6px' }}>
                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{error}</span>
              </div>
            )}

            {lastInvoice && success && (
              <div style={{ fontSize: '12px', color: '#059669', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#ECFDF5', padding: '10px', borderRadius: '6px' }}>
                <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
                <span>
                  <FormattedMessage
                    defaultMessage="{invoice} created and synced to your Dashboard."
                    description="Confirmation notice after invoice sync"
                    values={{ invoice: <strong>{lastInvoice}</strong> }}
                  />
                </span>
              </div>
            )}

            <Button 
              variant="primary" 
              disabled={isGenerating || !addElement || (activeTab === 'connected' && !amount)}
              loading={isGenerating}
              onClick={handleGenerate}
              stretch
            >
              {success ? (
                intl.formatMessage({
                  defaultMessage: "Added to Canvas",
                  description: "Confirmation button state"
                })
              ) : activeTab === 'connected' ? (
                intl.formatMessage({
                  defaultMessage: "Generate Invoice QR",
                  description: "Button text for tracked invoice creation"
                })
              ) : (
                intl.formatMessage({
                  defaultMessage: "Generate Guest QR",
                  description: "Button text for guest QR code insertion"
                })
              )}
            </Button>
            
            {activeTab === 'connected' && isConnected && !success && (
              <Text tone="secondary" size="small" alignment="center">
                <FormattedMessage
                  defaultMessage="Creates a tracked invoice in your XRPay Dashboard."
                  description="sync disclaimer subtext"
                />
              </Text>
            )}
          </Rows>
        )}
      </Rows>
    </div>
  );
};
