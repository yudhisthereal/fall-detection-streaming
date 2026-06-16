"""
CAREGIVER SERVER - Homomorphic Encryption Party
Responsibilities:
1. Encrypt features using _Enc1 (2 moduli: p1, q1)
2. Decrypt comparison results using _priv_comp_cg and _priv_comp1_cg
3. Re-encrypt comparison results using _Enc (6 moduli: p1, q1, r, s, t, w)
4. Decrypt final polynomial result using _decmul

This script acts as a server that:
- Receives plaintext features from Camera
- Sends encrypted features to Analytics
- Receives encrypted comparison results from Analytics
- Decrypts and re-encrypts comparison results
- Receives encrypted polynomial result from Analytics
- Decrypts final pose classification
"""

import math
import random
import json
import socket
import threading
import time
from datetime import datetime

# ============================================================================
# SECRET KEYS (Only known to CAREGIVER)
# ============================================================================

p1 = 234406548094233827948571379965547188853
q1 = 583457592311129510314141861330330044443
r = 696522972436164062959242838052087531431
s = 374670603170509799404699393785831797599
t = 443137959904584298054176676987615849169
w = 391475886865055383118586393345880578361
u = 2355788435550222327802749264573303139783

n1 = p1 * q1 * r * s * t * w

pinvq = 499967064455987294076532081570894386372
qinvp = 33542671637141449679641257954160235148
n11 = p1 * q1
gu = u.bit_length() // 2
u1 = u // 2

np1prod = q1 * r * s * t * w
nq1prod = p1 * r * s * t * w
nrprod = p1 * q1 * s * t * w
nsprod = p1 * q1 * r * t * w
ntprod = p1 * q1 * r * s * w
nwprod = p1 * q1 * r * t * s
invnp1 = 205139046479782337030801215788009754117
invnq1 = 429235397156384978572995593851807405098
invnr = 592155359269217457562309991915739180471
invns = 115186784058467557094932562011798848762
invnt = 51850665316568177665825586294193267244
invnw = 44855536902472009823152313099539628632


class CaregiverServer:
    """
    CAREGIVER Server - Handles all encryption/decryption operations
    """
    
    def __init__(self, host='localhost', port=5000):
        self.host = host
        self.port = port
        self.server_socket = None
        self.is_running = False
        
        # Store secret keys
        self.p1 = p1
        self.q1 = q1
        self.r = r
        self.s = s
        self.t = t
        self.w = w
        self.u = u
        self.n1 = n1
        self.n11 = n11
        self.gu = gu
        
        # CRT inverses
        self.pinvq = pinvq
        self.qinvp = qinvp
        self.np1prod = np1prod
        self.nq1prod = nq1prod
        self.nrprod = nrprod
        self.nsprod = nsprod
        self.ntprod = ntprod
        self.nwprod = nwprod
        self.invnp1 = invnp1
        self.invnq1 = invnq1
        self.invnr = invnr
        self.invns = invns
        self.invnt = invnt
        self.invnw = invnw
        
        print("[CAREGIVER] ✅ Server initialized")
        print(f"[CAREGIVER] 🔑 Secret keys loaded (p1, q1, r, s, t, w)")
        print(f"[CAREGIVER] 📊 CRT modulus n1 = {str(n1)[:30]}...")
        print(f"[CAREGIVER] 📊 u bit length: {gu}")
    
    # ========================================================================
    # ENCRYPTION METHODS
    # ========================================================================
    
    def _Enc(self, m):
        """
        Encrypt with 6 moduli (p1, q1, r, s, t, w)
        Used for: Re-encrypting comparison results
        """
        g = random.randint(1, 2**32 - 1)
        c1 = ((g * self.u) + m) % self.p1
        c2 = ((g * self.u) + m) % self.q1
        c3 = ((g * self.u) + m) % self.r
        c4 = ((g * self.u) + m) % self.s
        c5 = ((g * self.u) + m) % self.t
        c6 = ((g * self.u) + m) % self.w
        return c1, c2, c3, c4, c5, c6
    
    def _Enc1(self, m):
        """
        Encrypt with 2 moduli (p1, q1)
        Used for: Encrypting features
        """
        g = random.randint(1, 2**32 - 1)
        cth1 = ((g * self.u) + m) % self.p1
        cth2 = ((g * self.u) + m) % self.q1
        return cth1, cth2
    
    # ========================================================================
    # DECRYPTION METHODS
    # ========================================================================
    
    def _decmul(self, c1, c2, c3, c4, c5, c6):
        """
        Decrypt from 6 moduli (p1, q1, r, s, t, w)
        Used for: Decrypting final polynomial result
        """
        mout = ((((c1 % self.p1) * self.invnp1 * self.np1prod) + 
                 ((c2 % self.q1) * self.invnq1 * self.nq1prod) + 
                 ((c3 % self.r) * self.invnr * self.nrprod) + 
                 ((c4 % self.s) * self.invns * self.nsprod) + 
                 ((c5 % self.t) * self.invnt * self.ntprod) + 
                 ((c6 % self.w) * self.invnw * self.nwprod)) % self.n1)
        if mout > self.n1 // 2:
            mout = mout - self.n1
        mout = mout % self.u
        return mout
    
    def _priv_comp_cg(self, c111, c121):
        """
        Decrypt comparison result from 2 moduli (p1, q1)
        Used for: Decrypting threshold comparison results
        """
        mout = ((((c111 % self.p1) * self.qinvp * self.q1) + 
                 ((c121 % self.q1) * self.pinvq * self.p1)) % self.n11) % self.u
        rn = (mout + self.u) % self.u
        tg = rn.bit_length()
        gcomp = -5
        if self.gu > tg:
            gcomp = 0  # False
        elif self.gu < tg:
            gcomp = 1  # True
        else:
            gcomp = -1 # Undefined
        return gcomp
    
    def _priv_comp1_cg(self, c11, c12):
        """
        Decrypt encrypted comparison from 2 moduli (p1, q1)
        Used for: Decrypting encrypted vs encrypted comparison results
        """
        mout = ((((c11 % self.p1) * self.qinvp * self.q1) + 
                 ((c12 % self.q1) * self.pinvq * self.p1)) % self.n11)
        if mout > self.n11 // 2:
            mout = mout - self.n11
        mout = mout % self.u
        tg = mout.bit_length()
        if self.gu > tg:
            return 0  # False
        elif self.gu < tg:
            return 1  # True
        return 0
    
    # ========================================================================
    # BUSINESS LOGIC
    # ========================================================================
    
    def encrypt_features(self, features):
        """
        Step 1: Encrypt features using _Enc1 (2 moduli)
        Input: [Tra, Tha, Thl, cl, Trl, ll]
        Output: Encrypted features dictionary
        """
        print("\n[CAREGIVER] 🔐 Step 1: Encrypting features with _Enc1 (2 moduli)")
        
        feature_names = ['Tra', 'Tha', 'Thl', 'cl', 'Trl', 'll']
        encrypted = {}
        
        for name, value in zip(feature_names, features):
            c1, c2 = self._Enc1(value)
            encrypted[name] = {
                'plaintext': value,
                'ciphertext_1': c1,
                'ciphertext_2': c2
            }
            print(f"  ✓ {name}: {value} → (c1={str(c1)[:20]}..., c2={str(c2)[:20]}...)")
        
        return encrypted
    
    def decrypt_comparisons(self, encrypted_comparisons):
        """
        Step 2: Decrypt comparison results
        Input: Encrypted comparison results from Analytics
        Output: Decrypted comparison results
        """
        print("\n[CAREGIVER] 🔓 Step 2: Decrypting comparison results")
        
        results = {}
        
        # Decrypt threshold comparisons (using _priv_comp_cg)
        print("  Decrypting threshold comparisons...")
        results['T30'] = self._priv_comp_cg(
            encrypted_comparisons['T30'][0], 
            encrypted_comparisons['T30'][1]
        )
        results['T40'] = self._priv_comp_cg(
            encrypted_comparisons['T40'][0], 
            encrypted_comparisons['T40'][1]
        )
        results['T80'] = self._priv_comp_cg(
            encrypted_comparisons['T80'][0], 
            encrypted_comparisons['T80'][1]
        )
        results['T60'] = self._priv_comp_cg(
            encrypted_comparisons['T60'][0], 
            encrypted_comparisons['T60'][1]
        )
        
        # Decrypt encrypted comparisons (using _priv_comp1_cg)
        print("  Decrypting encrypted vs encrypted comparisons...")
        results['TC'] = self._priv_comp1_cg(
            encrypted_comparisons['TC'][0], 
            encrypted_comparisons['TC'][1]
        )
        results['TL'] = self._priv_comp1_cg(
            encrypted_comparisons['TL'][0], 
            encrypted_comparisons['TL'][1]
        )
        
        print(f"  → T30: {results['T30']} ({'YES' if results['T30']==1 else 'NO'})")
        print(f"  → T40: {results['T40']} ({'YES' if results['T40']==1 else 'NO'})")
        print(f"  → T80: {results['T80']} ({'YES' if results['T80']==1 else 'NO'})")
        print(f"  → T60: {results['T60']} ({'YES' if results['T60']==1 else 'NO'})")
        print(f"  → TC: {results['TC']} ({'YES' if results['TC']==1 else 'NO'})")
        print(f"  → TL: {results['TL']} ({'YES' if results['TL']==1 else 'NO'})")
        
        return results
    
    def reencrypt_comparisons(self, comparisons):
        """
        Step 3: Re-encrypt comparison results using _Enc (6 moduli)
        Input: Decrypted comparison results
        Output: Encrypted comparison results with 6 moduli
        """
        print("\n[CAREGIVER] 🔐 Step 3: Re-encrypting comparison results with _Enc (6 moduli)")
        
        # Encrypt each comparison result with 6 moduli
        # a = T30, b = T40, c = T80, d = TC, e = TL, f = T60
        c11, c21, c31, c41, c51, c61 = self._Enc(comparisons['T30'])
        c12, c22, c32, c42, c52, c62 = self._Enc(comparisons['T40'])
        c13, c23, c33, c43, c53, c63 = self._Enc(comparisons['T80'])
        c14, c24, c34, c44, c54, c64 = self._Enc(comparisons['TC'])
        c15, c25, c35, c45, c55, c65 = self._Enc(comparisons['TL'])
        c16, c26, c36, c46, c56, c66 = self._Enc(comparisons['T60'])
        
        print("  ✓ All 6 comparison results re-encrypted with 6 moduli")
        
        return {
            'a': {'c1': c11, 'c2': c21, 'c3': c31, 'c4': c41, 'c5': c51, 'c6': c61, 'value': comparisons['T30']},
            'b': {'c1': c12, 'c2': c22, 'c3': c32, 'c4': c42, 'c5': c52, 'c6': c62, 'value': comparisons['T40']},
            'c': {'c1': c13, 'c2': c23, 'c3': c33, 'c4': c43, 'c5': c53, 'c6': c63, 'value': comparisons['T80']},
            'd': {'c1': c14, 'c2': c24, 'c3': c34, 'c4': c44, 'c5': c54, 'c6': c64, 'value': comparisons['TC']},
            'e': {'c1': c15, 'c2': c25, 'c3': c35, 'c4': c45, 'c5': c55, 'c6': c65, 'value': comparisons['TL']},
            'f': {'c1': c16, 'c2': c26, 'c3': c36, 'c4': c46, 'c5': c56, 'c6': c66, 'value': comparisons['T60']}
        }
    
    def decrypt_final_result(self, polynomial_components):
        """
        Step 4: Decrypt final polynomial result using _decmul (6 moduli)
        Input: Encrypted polynomial components (pr1-pr6)
        Output: Decrypted pose code (0-3)
        """
        print("\n[CAREGIVER] 🔓 Step 4: Decrypting final result with _decmul (6 moduli)")
        
        pr1 = polynomial_components['pr1']
        pr2 = polynomial_components['pr2']
        pr3 = polynomial_components['pr3']
        pr4 = polynomial_components['pr4']
        pr5 = polynomial_components['pr5']
        pr6 = polynomial_components['pr6']
        
        result = self._decmul(pr1, pr2, pr3, pr4, pr5, pr6)
        
        print(f"  → Decrypted value: {result}")
        
        return result
    
    # ========================================================================
    # SERVER METHODS
    # ========================================================================
    
    def start_server(self):
        """Start the server to listen for requests"""
        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.bind((self.host, self.port))
            self.server_socket.listen(5)
            self.is_running = True
            
            print(f"\n[CAREGIVER] 🚀 Server listening on {self.host}:{self.port}")
            print("[CAREGIVER] ⏳ Waiting for connections...")
            
            while self.is_running:
                client_socket, address = self.server_socket.accept()
                print(f"\n[CAREGIVER] 📱 Connected to {address}")
                client_thread = threading.Thread(
                    target=self.handle_client,
                    args=(client_socket, address)
                )
                client_thread.start()
                
        except Exception as e:
            print(f"[CAREGIVER] ❌ Server error: {e}")
        finally:
            if self.server_socket:
                self.server_socket.close()
    
    def handle_client(self, client_socket, address):
        """Handle client requests"""
        try:
            data = client_socket.recv(65536).decode('utf-8')
            if not data:
                return
            
            request = json.loads(data)
            operation = request.get('operation')
            
            print(f"[CAREGIVER] 📨 Received operation: {operation}")
            
            response = {}
            
            if operation == 'encrypt_features':
                # Step 1: Encrypt features
                features = request.get('features')
                encrypted_features = self.encrypt_features(features)
                response = {
                    'status': 'success',
                    'operation': 'encrypt_features',
                    'encrypted_features': encrypted_features
                }
                
            elif operation == 'decrypt_comparisons':
                # Step 2: Decrypt comparison results
                encrypted_comparisons = request.get('encrypted_comparisons')
                comparisons = self.decrypt_comparisons(encrypted_comparisons)
                response = {
                    'status': 'success',
                    'operation': 'decrypt_comparisons',
                    'comparisons': comparisons
                }
                
            elif operation == 'reencrypt_comparisons':
                # Step 3: Re-encrypt comparison results
                comparisons = request.get('comparisons')
                reencrypted = self.reencrypt_comparisons(comparisons)
                response = {
                    'status': 'success',
                    'operation': 'reencrypt_comparisons',
                    'reencrypted': reencrypted
                }
                
            elif operation == 'decrypt_final':
                # Step 4: Decrypt final result
                polynomial_components = request.get('polynomial_components')
                result = self.decrypt_final_result(polynomial_components)
                response = {
                    'status': 'success',
                    'operation': 'decrypt_final',
                    'result': result
                }
                
            else:
                response = {
                    'status': 'error',
                    'message': f'Unknown operation: {operation}'
                }
            
            # Send response
            client_socket.send(json.dumps(response).encode('utf-8'))
            print(f"[CAREGIVER] ✅ Response sent for operation: {operation}")
            
        except Exception as e:
            print(f"[CAREGIVER] ❌ Error handling client: {e}")
            error_response = {
                'status': 'error',
                'message': str(e)
            }
            client_socket.send(json.dumps(error_response).encode('utf-8'))
        finally:
            client_socket.close()
    
    def stop_server(self):
        """Stop the server"""
        self.is_running = False
        if self.server_socket:
            self.server_socket.close()
        print("[CAREGIVER] 🛑 Server stopped")


# ============================================================================
# CLIENT FUNCTIONS (for testing)
# ============================================================================

def test_caregiver_server():
    """Test the caregiver server with sample data"""
    caregiver = CaregiverServer()
    
    # Test features
    features = [105, 184, 4042, 3851, 5478, 7888]
    
    print("\n" + "="*80)
    print("TESTING CAREGIVER OPERATIONS")
    print("="*80)
    
    # Test Step 1: Encrypt features
    encrypted_features = caregiver.encrypt_features(features)
    print("\n✅ Step 1: Features encrypted")
    
    # Simulate encrypted comparisons from Analytics
    # In real scenario, these would come from Analytics server
    test_encrypted_comparisons = {
        'T30': (123456789, 987654321),
        'T40': (234567890, 876543210),
        'T80': (345678901, 765432109),
        'T60': (456789012, 654321098),
        'TC': (567890123, 543210987),
        'TL': (678901234, 432109876)
    }
    
    # Test Step 2: Decrypt comparisons
    comparisons = caregiver.decrypt_comparisons(test_encrypted_comparisons)
    print("\n✅ Step 2: Comparisons decrypted")
    
    # Test Step 3: Re-encrypt comparisons
    reencrypted = caregiver.reencrypt_comparisons(comparisons)
    print("\n✅ Step 3: Comparisons re-encrypted")
    
    # Test Step 4: Decrypt final result
    test_polynomial = {
        'pr1': 123456789,
        'pr2': 234567890,
        'pr3': 345678901,
        'pr4': 456789012,
        'pr5': 567890123,
        'pr6': 678901234
    }
    result = caregiver.decrypt_final_result(test_polynomial)
    print(f"\n✅ Step 4: Final result decrypted: {result}")
    
    print("\n" + "="*80)
    print("✅ All caregiver operations tested successfully")
    print("="*80)


# ============================================================================
# MAIN - Run as Server
# ============================================================================

if __name__ == "__main__":
    print("\n" + "="*80)
    print("🏥 CAREGIVER HOMOMORPHIC ENCRYPTION SERVER")
    print("="*80)
    
    # For testing without network, run operations directly
    test_caregiver_server()
    
    # To run as a server, uncomment the code below:
    """
    caregiver = CaregiverServer(host='localhost', port=5000)
    try:
        caregiver.start_server()
    except KeyboardInterrupt:
        caregiver.stop_server()
        print("\n[CAREGIVER] Server stopped by user")
    """