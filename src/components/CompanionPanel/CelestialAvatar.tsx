import React from 'react';

export const CelestialAvatar: React.FC = () => {
  return (
    <svg
      className="avatar-svg"
      viewBox="0 0 240 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Stella Celestial Avatar"
      role="img"
    >
      <defs>
        {/* Hair Gradients */}
        <linearGradient id="avatarHairGrad" x1="60" y1="24" x2="180" y2="216" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#EED8EA" />
          <stop offset="42%" stopColor="#C89EB9" />
          <stop offset="85%" stopColor="#5B364A" />
          <stop offset="100%" stopColor="#3C2130" />
        </linearGradient>

        <linearGradient id="hairHighlightGrad" x1="120" y1="42" x2="120" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.75" />
          <stop offset="50%" stopColor="#F5DCEB" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#EED8EA" stopOpacity="0" />
        </linearGradient>

        {/* Face Gradient */}
        <linearGradient id="avatarFaceGrad" x1="120" y1="80" x2="120" y2="168" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF7FA" />
          <stop offset="70%" stopColor="#F8EAEF" />
          <stop offset="100%" stopColor="#E9D7DD" />
        </linearGradient>

        {/* Star Crest Tiara Gradient */}
        <linearGradient id="starCrestGrad" x1="102" y1="24" x2="138" y2="72" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF2EE" />
          <stop offset="40%" stopColor="#FFC8BC" />
          <stop offset="80%" stopColor="#D4A5B8" />
          <stop offset="100%" stopColor="#9C6B80" />
        </linearGradient>

        {/* Soft Neck Collar & Ribbon Gradient */}
        <linearGradient id="collarRibbonGrad" x1="110" y1="160" x2="130" y2="188" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFDAD4" />
          <stop offset="100%" stopColor="#D4A5B8" />
        </linearGradient>
      </defs>

      {/* 1. Deep Back Hair Locks (left & right volume) */}
      <path
        d="M66 108C46 130 34 168 40 198C54 186 70 158 78 136C74 126 70 117 66 108Z"
        fill="#3A2130"
      />
      <path
        d="M174 108C194 130 206 168 200 198C186 186 170 158 162 136C166 126 170 117 174 108Z"
        fill="#3A2130"
      />
      
      {/* Outer twin trailing hair wisps */}
      <path
        d="M48 160C38 180 44 204 54 212C50 196 52 180 58 166Z"
        fill="#523043"
        opacity="0.85"
      />
      <path
        d="M192 160C202 180 196 204 186 212C190 196 188 180 182 166Z"
        fill="#523043"
        opacity="0.85"
      />

      {/* 2. Main Lilac Hair Canopy & Side Wings */}
      <path
        d="M60 98C60 55 84 43 120 43C156 43 180 55 180 98C180 132 170 166 160 184C145 171 140 152 140 152C140 152 135 169 120 169C105 169 100 152 100 152C100 152 95 171 80 184C70 166 60 132 60 98Z"
        fill="url(#avatarHairGrad)"
      />

      {/* Hair Crown Luminous Highlight Arc */}
      <path
        d="M78 84C82 62 98 52 120 52C142 52 158 62 162 84C152 74 138 68 120 68C102 68 88 74 78 84Z"
        fill="url(#hairHighlightGrad)"
      />

      {/* 3. Delicate Face Structure */}
      <path
        d="M87 94C87 82 98 72 120 72C142 72 153 82 153 94C153 120 142 144 120 154C98 144 87 120 87 94Z"
        fill="url(#avatarFaceGrad)"
      />

      {/* Ear Silhouettes */}
      <path
        d="M83 104C79 106 77 114 81 120C84 124 88 123 88 118"
        stroke="#E6CED4"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="#F8EAEF"
      />
      <path
        d="M157 104C161 106 163 114 159 120C156 124 152 123 152 118"
        stroke="#E6CED4"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="#F8EAEF"
      />

      {/* 4. Elegant Front Bangs with Layered Strands */}
      <path
        d="M82 89C90 106 98 118 104 109C109 103 111 88 114 83C116 88 121 106 128 108C134 110 142 97 151 89C145 109 146 130 142 142C137 110 129 96 120 96C111 96 103 110 98 142C94 130 94 109 82 89Z"
        fill="#EED8EA"
      />
      {/* Delicate inner bang strand separation */}
      <path
        d="M106 90C110 99 116 102 120 96"
        stroke="#D5AEC7"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M124 90C128 99 134 102 138 95"
        stroke="#D5AEC7"
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* 5. Serene Eye Expressions & Eyebrows */}
      {/* Delicate gently curved eyebrows */}
      <path
        d="M97 103C102 100 108 100 112 102"
        stroke="#845D71"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M128 102C132 100 138 100 143 103"
        stroke="#845D71"
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      {/* Serene closed curved eyelashes */}
      <path
        d="M98 113C102 110 109 110 113 114"
        stroke="#4F2E3E"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M127 114C131 110 138 110 142 113"
        stroke="#4F2E3E"
        strokeWidth="2.6"
        strokeLinecap="round"
      />

      {/* Upper lash accents */}
      <path d="M112 112L115 110" stroke="#4F2E3E" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M128 110L131 112" stroke="#4F2E3E" strokeWidth="1.6" strokeLinecap="round" />

      {/* Delicate Nose Tint */}
      <circle cx="120" cy="123" r="1" fill="#D5AEC7" opacity="0.6" />

      {/* Gentle Serene Smile */}
      <path
        d="M116 132C118 134 122 134 124 132"
        stroke="#845D71"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      {/* Cheerful Soft Peach Blush Marks */}
      <circle cx="96" cy="122" r="3.6" fill="#FFB4A7" opacity="0.75" />
      <circle cx="97" cy="122" r="2.2" fill="#FFA192" opacity="0.4" />
      <circle cx="144" cy="122" r="3.6" fill="#FFB4A7" opacity="0.75" />
      <circle cx="143" cy="122" r="2.2" fill="#FFA192" opacity="0.4" />

      {/* 6. Collar Neck Ornament & Rose-Gold Pendant */}
      <path
        d="M113 154C117 156 123 156 127 154"
        stroke="#E6CED4"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <polygon points="120,157 127,167 120,175 113,167" fill="url(#collarRibbonGrad)" />
      <circle cx="120" cy="166" r="2" fill="#FFFFFF" opacity="0.9" />

      {/* Twin delicate collar ribbons */}
      <path
        d="M114 167C107 175 105 186 109 191C111 185 114 177 117 171"
        fill="#FFDAD4"
        opacity="0.8"
      />
      <path
        d="M126 167C133 175 135 186 131 191C129 185 126 177 123 171"
        fill="#FFDAD4"
        opacity="0.8"
      />

      {/* 7. Crystalline Star Crest Tiara */}
      <path
        d="M120 28L125 44L141 48L127 55L129 71L119 58L106 69L110 52L97 47L113 43L120 28Z"
        fill="url(#starCrestGrad)"
        opacity="0.98"
      />
      <circle cx="120" cy="49" r="3" fill="#FFFFFF" />
      <circle cx="120" cy="49" r="1.5" fill="#FFE2DC" />

      {/* Twin delicate floating side hair stars */}
      <path
        d="M86 64L88 70L94 71L89 74L90 80L86 76L81 79L83 73L78 71L84 69L86 64Z"
        fill="url(#starCrestGrad)"
        opacity="0.85"
      />
      <path
        d="M154 64L156 69L162 71L157 73L159 79L154 76L150 80L151 74L146 71L152 70L154 64Z"
        fill="url(#starCrestGrad)"
        opacity="0.85"
      />
    </svg>
  );
};
