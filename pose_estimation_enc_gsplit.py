import numpy as np
from collections import deque
import random
import time
import math
# secret keys at caregiver
p1 =   234406548094233827948571379965547188853
q1 =   583457592311129510314141861330330044443
r=696522972436164062959242838052087531431
s=374670603170509799404699393785831797599
t=443137959904584298054176676987615849169
w=391475886865055383118586393345880578361
u =  2355788435550222327802749264573303139783
     
n1 = p1 * q1*r*s*t*w

pinvq = 499967064455987294076532081570894386372
qinvp = 33542671637141449679641257954160235148
n11= p1 * q1
gu = u.bit_length() // 2
u1 = u//2

np1prod=q1*r*s*t*w
nq1prod=p1*r*s*t*w
nrprod=p1*q1*s*t*w
nsprod=p1*q1*r*t*w
ntprod=p1*q1*r*s*w
nwprod=p1*q1*r*t*s
invnp1=205139046479782337030801215788009754117
invnq1=429235397156384978572995593851807405098
invnr=592155359269217457562309991915739180471
invns= 115186784058467557094932562011798848762
invnt=51850665316568177665825586294193267244
invnw=44855536902472009823152313099539628632

class PoseEstimationenc:
    """Very small pose classifier: returns one of 'standing', 'sitting', 'bending_down', 'lying_down', or None

    Changes:
    - Reject frames with incomplete keypoints by checking a missing-value sentinel (default -1).
    - Append to the smoothing deque only when the current frame is complete.
    - Return None (and set self.status = []) when keypoints are incomplete or angles cannot be computed.
    - Added limb length ratios to distinguish sitting and bending_down from standing.
    """
    def __init__(self, keypoints_window_size=5, missing_value=-1):
        self.keypoints_map_deque = deque(maxlen=keypoints_window_size)
        self.status = []
        self.missing_value = missing_value
        
        # Thresholds for limb length ratios
        self.thigh_calf_ratio_threshold = 0.7  # If thigh is significantly shorter than calf
        self.torso_leg_ratio_threshold = 0.5   # If torso is significantly shorter than leg
# At camera
    def feed_keypoints_17(self, keypoints_17):
        # keypoints_17: flattened list/array [x0,y0, x1,y1, ..., x16,y16]
        keypoints = np.array(keypoints_17).reshape((-1, 2))
        assert keypoints.shape == (17, 2)

        kp_map = {
            'Left Shoulder': keypoints[5],
            'Right Shoulder': keypoints[6],
            'Left Hip': keypoints[11],
            'Right Hip': keypoints[12],
            'Left Knee': keypoints[13],
            'Right Knee': keypoints[14],
            'Left Ankle': keypoints[15],
            'Right Ankle': keypoints[16]
        }

        return self.feed_keypoints_map(kp_map)
#Camera
    def _is_frame_complete(self, keypoints_map):
        """Return True if none of the required keypoints contain the missing_value sentinel."""
        for k, v in keypoints_map.items():
            # v is an array-like [x, y]
            if v is None:
                return False
            # check both coordinates for sentinel
            if v[0] == self.missing_value or v[1] == self.missing_value:
                return False
        return True
#At camera
    def _calculate_limb_lengths(self, km):
        """Calculate limb lengths and ratios for posture classification."""
        # Calculate thigh length (hip to knee)
        left_thigh = np.linalg.norm(km['Left Hip'] - km['Left Knee'])
        right_thigh = np.linalg.norm(km['Right Hip'] - km['Right Knee'])
        thigh_length = (left_thigh + right_thigh) / 2.0
        
        # Calculate calf length (knee to ankle)
        left_calf = np.linalg.norm(km['Left Knee'] - km['Left Ankle'])
        right_calf = np.linalg.norm(km['Right Knee'] - km['Right Ankle'])
        calf_length = (left_calf + right_calf) / 2.0
        
        # Calculate torso height (shoulder to hip)
        left_torso = np.linalg.norm(km['Left Shoulder'] - km['Left Hip'])
        right_torso = np.linalg.norm(km['Right Shoulder'] - km['Right Hip'])
        torso_height = (left_torso + right_torso) / 2.0
        
        # Calculate leg length (hip to ankle)
        left_leg = np.linalg.norm(km['Left Hip'] - km['Left Ankle'])
        right_leg = np.linalg.norm(km['Right Hip'] - km['Right Ankle'])
        leg_length = (left_leg + right_leg) / 2.0
        
        # Calculate ratios
        #thigh_calf_ratio = thigh_length / calf_length if calf_length > 0 else 1.0
        #torso_leg_ratio = torso_height / leg_length if leg_length > 0 else 1.0
        
        return thigh_length,calf_length,torso_height,leg_length
   

#At caregiver: Encryption works on integer: real number to integer conversion and retain 2 decimal points    

    def _truncate(self,num):
         factor = 100
         return math.trunc(num * factor)

#At caregiver: for Encrypting comparison results

    def _Enc(self,m):
        g = random.randint(1, 2**32 - 1)
    #th = 800  # threshold is with server
    #print(g)
    # Encryption at server
    
        c1 = ((g * u) + m) % p1
        c2 = ((g * u) + m) % q1
        c3 = ((g * u) + m) % r
        c4 = ((g * u) + m) % s
        c5 = ((g * u) + m) % t
        c6 = ((g * u) + m) % w
        return c1, c2,c3, c4,c5, c6
# At caregiver:for decrypting the pose
    def _decmul(self,c1, c2,c3, c4,c5, c6):
    
        mout = ((((c1 % p1) * invnp1 * np1prod) + ((c2 % q1) * invnq1 * nq1prod)+ ((c3 % r) * invnr * nrprod) +((c4 % s) * invns * nsprod) +((c5 % t) * invnt * ntprod)+((c6 % w) * invnw * nwprod)) % n1) 
        if mout>n1//2:
          mout = mout-n1
        mout = mout % u
        return mout
# At caregiver:for encrypting features of the skeleton
    def _Enc1(self,m):
        g = random.randint(1, 2**32 - 1)
   
    # Encryption at user
    
        cth1 = ((g * u) + m) % p1
        cth2 = ((g * u) + m) % q1
    
        return cth1, cth2
#At Analytics: comparing one encrypted value and a plain threshold
    def _priv_comp_an(self,cth1, cth2, cs):
      
    # Homomorphic operations at server
  
        r1 = random.randint(1, 2**22 - 1)
        r2 = random.randint(1, 2**10 - 1)
        c111 = r2 + (r1 * 2 * (cth1 - cs))
        c121 = r2 + (r1 * 2 * (cth2 - cs))
        return c111, c121 
# At caregiver:comparing one encrypted value and a plain threshold      
    def _priv_comp_cg(self,c111, c121):
    # Comparison result at user
        mout = ((((c111 % p1) * qinvp * q1) + ((c121 % q1) * pinvq * p1)) % n11) % u
    #print(mout)
        rn = (mout + u) % u
        tg = rn.bit_length()
    #print(tg)
        gcomp = -5 
        if gu > tg:
           gcomp= 0
        elif gu < tg:
           gcomp= 1
        else: 
           gcomp=-1
        
       
        return gcomp       
 #At Analytics: comparing two encrypted values     
    def _priv_comp1_an(self,cth11, cth21, cth3, cth4):
      
    # Homomorphic operations at server
  
       r1 = random.randint(1, 2**22 - 1)
       r2 = random.randint(1, 2**10 - 1)
       c11 =  r2 + (r1 * 2 * (cth11 - cth3))
       c12 =  r2 + (r1 * 2 * (cth21 - cth4))
       return c11, c12 
       
# At caregiver: comparing two encrypted values     
    def _priv_comp1_cg(self,c11, c12):
    # Comparison result at user
       mout = ((((c11 % p1) * qinvp * q1) + ((c12 % q1) * pinvq * p1)) % n11) 
       if mout>n11//2:
          mout = mout-n11
       mout = mout % u
    
       tg = mout.bit_length()
    #print("bitlength", tg)
        
       if gu > tg:
         gcomp1= 0
       elif gu < tg:
         gcomp1= 1
       
       return gcomp1

    def feed_keypoints_map(self, keypoints_map):
#Camera: calculating thigh_length, calf_length, torso_height,leg_length,torso_anglethigh_uprightness
        # If current frame is incomplete, clear status and do not append — return None
        if not self._is_frame_complete(keypoints_map):
            self.status = []
            return None

        # append the verified-complete frame for temporal smoothing
        self.keypoints_map_deque.append(keypoints_map)

        # compute averaged keypoints over the deque
        km = {
            key: sum(d[key] for d in self.keypoints_map_deque) / len(self.keypoints_map_deque)
            for key in self.keypoints_map_deque[0].keys()
        }

        # compute centers
        shoulder_center = (km['Left Shoulder'] + km['Right Shoulder']) / 2.0
        hip_center = (km['Left Hip'] + km['Right Hip']) / 2.0
        knee_center = (km['Left Knee'] + km['Right Knee']) / 2.0

        torso_vec = shoulder_center - hip_center
        thigh_vec = knee_center - hip_center

        up_vector = np.array([0.0, -1.0])

        # safe angle computation: if vector norm is zero, return None
        torso_norm = np.linalg.norm(torso_vec)
        thigh_norm = np.linalg.norm(thigh_vec)
        if torso_norm == 0 or thigh_norm == 0:
            self.status = []
            return None

        torso_angle = np.degrees(np.arccos(np.clip(
            np.dot(torso_vec, up_vector) / (torso_norm * np.linalg.norm(up_vector)), -1.0, 1.0)))

        thigh_angle = np.degrees(np.arccos(np.clip(
            np.dot(thigh_vec, up_vector) / (thigh_norm * np.linalg.norm(up_vector)), -1.0, 1.0)))

        # convert thigh angle to "uprightness" where smaller is more upright
        thigh_uprightness = abs(thigh_angle - 180.0)

        # Calculate  lengths
        thigh_length,calf_length,torso_height,leg_length = self._calculate_limb_lengths(km)
     
#Caregiver encrypting thigh_length, calf_length, torso_height,leg_length,torso_anglethigh_uprightness
       
        # Real to integer conversion
        Thl=self._truncate(thigh_length)
        cl=self._truncate(calf_length)
        Trl=self._truncate(torso_height)
        ll=self._truncate(leg_length)
        Tra=self._truncate(torso_angle )
        Tha=self._truncate(thigh_uprightness)
        # Encrypting skeleton features
        
        Tra1, Tra2= self._Enc1(Tra)
        Tha1, Tha2= self._Enc1(Tha)
        Thl1, Thl2= self._Enc1(Thl)
        cl1, cl2= self._Enc1(cl)
        Trl1, Trl2= self._Enc1(Trl)
        ll1, ll2= self._Enc1(ll)
 
#Analytics:comparison operations 
        T301, T302= self._priv_comp_an(Tra1, Tra2, 3000)        
        T401,T402=self._priv_comp_an(Tha1, Tha2, 4000)      
        T801, T802=self._priv_comp_an(Tra1, Tra2, 8000)
        T601, T602=self._priv_comp_an(Tha1, Tha2, 6000)
        TC1, TC2 =self._priv_comp1_an(Thl1*10, Thl2*10, cl1*7, cl2*7)
        TL1, TL2 = self._priv_comp1_an(Trl1*10, Trl2*10, ll1*5, ll2*5)      
# caregiver: comparison operations  and encrypting comparison result
        T30=self._priv_comp_cg(T301, T302)
        T40=self._priv_comp_cg(T401, T402)
        T80=self._priv_comp_cg(T801, T802)
        T60=self._priv_comp_cg(T601, T602)
        TC=self._priv_comp1_cg(TC1, TC2)
        TL=self._priv_comp1_cg(TL1, TL2)
        c11, c21,c31, c41,c51, c61=   self._Enc(T30);#a
        c12, c22,c32, c42,c52, c62=   self._Enc(T40);#b
        c13, c23,c33, c43,c53, c63=   self._Enc(T80);#c
        c14, c24,c34, c44,c54, c64=   self._Enc(TC);#d
        c15, c25,c35, c45,c55, c65=  self._Enc(TL);#e
        c16, c26,c36, c46,c56, c66=  self._Enc(T60);#f
#Analytics:Polynomial evaluation

         # Polynomial evaluation for LSB
        pr1l= (c11*c12*c14)+(c11*(1-c12))+(1-c13)+((1-c11)*c13*(1-c16))
        pr2l= (c21*c22*c24)+(c21*(1-c22))+(1-c23)+((1-c21)*c23*(1-c26))
        pr3l= (c31*c32*c34)+(c31*(1-c32))+(1-c33)+((1-c31)*c33*(1-c36))
        pr4l= (c41*c42*c44)+(c41*(1-c42))+(1-c43)+((1-c41)*c43*(1-c46))
        pr5l= (c51*c52*c54)+(c51*(1-c52))+(1-c53)+((1-c51)*c53*(1-c56))
        pr6l= (c61*c62*c64)+(c61*(1-c62))+(1-c63)+((1-c61)*c63*(1-c66))
        # Polynomial evaluation for MSB
        pr1m= (c11*c12*(1-c14)*c15)+((1-c11)* c13*c16)+(1-c13)+((1-c11)*c13*(1-c16))
        pr2m= (c21*c22*(1-c24)*c25)+((1-c21)* c23*c26)+(1-c23)+((1-c21)*c23*(1-c26))
        pr3m= (c31*c32*(1-c34)*c35)+((1-c31)* c33*c36)+(1-c33)+((1-c31)*c33*(1-c36))
        pr4m= (c41*c42*(1-c44)*c45)+((1-c41)* c43*c46)+(1-c43)+((1-c41)*c43*(1-c46))
        pr5m= (c51*c52*(1-c54)*c55)+((1-c51)* c53*c56)+(1-c53)+((1-c51)*c53*(1-c56))
        pr6m= (c61*c62*(1-c64)*c65)+((1-c61)* c63*c66)+(1-c63)+((1-c61)*c63*(1-c66))
       # Computing the class from MSB and LSB
        pr1= pr1m*2+pr1l
        pr2= pr2m*2+pr2l
        pr3= pr3m*2+pr3l
        pr4= pr4m*2+pr4l
        pr5= pr5m*2+pr5l
        pr6= pr6m*2+pr6l
#Caregiver: Decryption to get the pose
        mout=self._decmul(pr1, pr2,pr3, pr4, pr5,pr6)
        if mout==0:
         pose="standing"
        elif mout==1:
         pose="sitting"
        elif mout==2:
         pose="bending down"
        elif mout==3:
         pose="lying down" 
        else:
         pose="None"  

        self.status = [pose]
        return pose

    
    
    def evaluate_pose(self, keypoints):
        # returns label string or None
        res = self.feed_keypoints_17(keypoints)
        if res is None:
            return None
        return self.status[0] if self.status else None
        
        
    
  
